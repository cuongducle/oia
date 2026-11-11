#!/usr/bin/env python3
"""Quality metrics for deconstruct reconstructions (D22 evidence harness).

Compares ORIGINAL vs RECONSTRUCTED per text line and on the background:
  - per-line region SSIM + PSNR (the scene-text-editing convention: CVPR26
    "Towards Training-free Scene Text Editing" reports 89.30 SSIM / 22.47 PSNR;
    AAAI23 stroke-level editing uses the same trio) on the upright line crop;
  - per-line ink-mask IoU (internal objective: same fill-colored pixels);
  - background preservation outside the text mask (mean abs diff, fraction of
    pixels off by > 8). This is the automated catch for plate damage: the old
    min/max fill bug painted rectangles the color gates called "clean".

Usage: deconstruct-metrics.py <original> <reconstructed> <texts-final.json> <outDir> [--plate plate.png]
Writes metrics.json; refuses to overwrite.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from skimage.metrics import structural_similarity

ap = argparse.ArgumentParser()
ap.add_argument("original")
ap.add_argument("reconstructed")
ap.add_argument("texts")
ap.add_argument("out_dir")
ap.add_argument("--plate", default=None)
args = ap.parse_args()

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
metrics_path = out_dir / "metrics.json"
if metrics_path.exists():
    sys.exit(f"refusing to overwrite {metrics_path}")

original = cv2.imread(args.original)
recon = cv2.imread(args.reconstructed)
if original is None or recon is None or original.shape != recon.shape:
    sys.exit("images missing or shape mismatch")
h, w = original.shape[:2]
texts = json.loads(Path(args.texts).read_text())
plate = cv2.imread(args.plate) if args.plate else None

def line_box_px(t):
    b = t["box"]
    pad_px = b["h"] * h * 0.12 + 2  # đơn vị pixel; mặt nạ chỉ cần loại nét chữ
    x0 = max(0, int(b["x"] * w - pad_px)); y0 = max(0, int(b["y"] * h - pad_px))
    x1 = min(w, int((b["x"] + b["w"]) * w + pad_px)); y1 = min(h, int((b["y"] + b["h"]) * h + pad_px))
    return x0, y0, x1, y1

def region_ssim_psnr(a, b):
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    if ga.shape[0] < 7 or ga.shape[1] < 7:
        return None, None
    ssim = structural_similarity(ga, gb, data_range=255)
    mse = float(np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2))
    psnr = 100.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)
    return float(ssim), float(psnr)

def ink_mask(region_bgr, fill_hex, tol=60):
    rgb = np.array([int(fill_hex[i:i+2], 16) for i in (5, 3, 1)], dtype=np.float64)  # hex là RGB, ảnh là BGR
    dist = np.linalg.norm(region_bgr.astype(np.float64) - rgb, axis=2)
    return dist <= tol

# 1) mỗi dòng: SSIM/PSNR vùng + IoU mặt nạ mực
lines = []
mask_all = np.zeros((h, w), np.uint8)
for t in texts:
    x0, y0, x1, y1 = line_box_px(t)
    if x1 <= x0 or y1 <= y0:
        continue
    mask_all[y0:y1, x0:x1] = 255
    a, b = original[y0:y1, x0:x1], recon[y0:y1, x0:x1]
    ssim, psnr = region_ssim_psnr(a, b)
    fill = t.get("typography", {}).get("fill")
    iou = None
    if fill:
        ma, mb = ink_mask(a, fill), ink_mask(b, fill)
        union = np.logical_or(ma, mb).sum()
        iou = float(np.logical_and(ma, mb).sum() / union) if union else 0.0
    lines.append({"text": t["text"], "ssim": ssim, "psnr": psnr, "ink_iou": iou,
                  "box": [x0, y0, x1, y1]})

# 2) nền ngoài vùng chữ: phải gần như GIỮNG NGUYÊN
bg = mask_all == 0
bg_count = int(bg.sum())
def background_report(img, name):
    if bg_count < 5000:
        return {"name": name, "unmeasurable": True,
                "reason": f"only {bg_count}px outside text mask on this poster"}
    diff = np.abs(original.astype(np.float64) - img.astype(np.float64)).max(axis=2)
    d = diff[bg]
    return {"name": name, "pixels": bg_count, "meanAbsDiff": float(d.mean()), "p99": float(np.percentile(d, 99)),
            "fracAbove8": float((d > 8).mean()), "fracAbove30": float((d > 30).mean())}

reports = [background_report(recon, "reconstructed")]
if plate is not None and plate.shape == original.shape:
    reports.append(background_report(plate, "plate"))

ssims = [l["ssim"] for l in lines if l["ssim"] is not None]
ious = [l["ink_iou"] for l in lines if l["ink_iou"] is not None]
summary = {
    "scope": "original vs reconstructed; region SSIM/PSNR per line (scene-text-editing convention), ink IoU, background preservation",
    "lines": len(lines),
    "ssim": {"mean": float(np.mean(ssims)), "min": float(np.min(ssims)), "max": float(np.max(ssims)),
             "below06": int(np.sum(np.array(ssims) < 0.6))},
    "ink_iou": {"mean": float(np.mean(ious)), "min": float(np.min(ious))},
    "textMaskCoverage": float((mask_all > 0).mean()), "background": reports,
    "note": "SSIM is depressed by font approximation (declared limitation), NOT only by errors; background fracAbove8 is the damage catch. Gate thresholds are an owner decision.",
}
metrics_path.write_text(json.dumps({"summary": summary, "lines": lines}, ensure_ascii=False, indent=1))
print(json.dumps(summary, ensure_ascii=False, indent=1))
