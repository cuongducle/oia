#!/usr/bin/env python3
"""Visual QA for studio templates: render artwork + the authored text layers as
close to the scene spec as PIL allows (fonts approximate; placement/contrast/
hierarchy are what we judge). Parses apps/desktop/src/shared/studio-templates.ts
so the composite always matches the source of truth.

Usage: python3 scripts/visual-template-qa.py  (from apps/desktop) → /tmp/tpl-visual/<id>.png
"""
import os, re, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "../src/shared/studio-templates.ts")
PUB = os.path.join(HERE, "../src/renderer/public/studio")
OUT = "/tmp/tpl-visual"
FDIR = "/tmp/oia-fonts"

FONTS = {
  "default": os.path.join(FDIR, "Archivo[wdth,wght].ttf"),
  "Georgia": "/System/Library/Fonts/Supplemental/Georgia.ttf",
  "Georgia-italic": "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
}
os.makedirs(OUT, exist_ok=True)
ts = open(SRC).read()

def parse_template(block):
    tid = re.search(r'template\("([^"]+)"', block).group(1)
    dim = re.search(r'w: (\d+), h: (\d+)', block)
    tw, th = (int(dim.group(1)), int(dim.group(2))) if dim else (1024, 1536)
    art = re.search(r'template\("[^"]+", "[^"]*", "[^"]*", "([\w-]+)"', block).group(1)
    m = re.search(r'category: "([\w-]+)"', block)
    cat = m.group(1) if m else "?"
    texts = []
    for tm in re.finditer(r'text\(("(?:[^"\\]|\\.)*"),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*"(#?\w+)"(.*?)\),\n', block):
        raw = tm.group(1)
        content = raw[1:-1].replace("\\n", "\n") if raw.startswith('"') else raw
        x, y, w, size, color = float(tm.group(2)), float(tm.group(3)), float(tm.group(4)), float(tm.group(5)), tm.group(6)
        extra = tm.group(7)
        align = "right" if 'textAlign: "right"' in extra else ("center" if 'textAlign: "center"' in extra else "left")
        wm = re.search(r'fontWeight: (\d+)', extra)
        bold = int(wm.group(1)) if wm else 500
        spacing = float(re.search(r'charSpacing: (-?\d+)', extra).group(1)) if re.search(r'charSpacing: (-?\d+)', extra) else 0
        lh = float(re.search(r'lineHeight: ([\d.]+)', extra).group(1)) if re.search(r'lineHeight: ([\d.]+)', extra) else 1.0
        texts.append(dict(text=content, x=x, y=y, w=w, size=size, color=color, align=align, bold=bold, spacing=spacing, lh=lh,
                          georgia=('fontFamily: "Georgia"' in extra),
                          italic=('fontStyle: "italic"' in extra),
                          strike=('linethrough: true' in extra)))
    return tid, art, cat, texts, (tw, th)

matches = list(re.finditer(r'template\("([\w-]+)".*?\n  \], \{[^\n]*\}\),', ts, re.S))
print(f"found {len(matches)} templates")

for m in matches:
    tid, art, cat, texts, (tw, th) = parse_template(m.group(0))
    im = Image.open(os.path.join(PUB, f"{art}.webp")).convert("RGB").resize((tw, th), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for t in texts:
        try:
            f = ImageFont.truetype(FONTS["default"] if t.get("georgia") is None else FONTS.get("Georgia-italic" if t.get("italic") else "Georgia", FONTS["default"]), int(t["size"]))
            try:
                # Archivo variable: axes [wdth, wght] — honor light display weights
                f.set_variation_by_axes([max(100, min(900, int(t["bold"]))), 100])
            except Exception:
                pass
        except Exception:
            f = ImageFont.load_default()
        raw_lines = t["text"].split("\n")
        lines = []
        for rl in raw_lines:
            words = rl.split(" ")
            cur = ""
            for wd in words:
                trial = (cur + " " + wd).strip()
                tw = sum(d.textlength(c, font=f) + t["spacing"] * t["size"] / 1000 for c in trial)
                if tw > t["w"] and cur:
                    lines.append(cur); cur = wd
                else:
                    cur = trial
            lines.append(cur)
        y = t["y"]
        for ln in lines:
            # charSpacing approximated by drawing per-char
            widths = [d.textlength(c, font=f) + t["spacing"] * t["size"] / 1000 for c in ln]
            total = sum(widths)
            if t["align"] == "center":
                x = t["x"] + (t["w"] - total) / 2
            elif t["align"] == "right":
                x = t["x"] + t["w"] - total
            else:
                x = t["x"]
            lx0 = x
            for c in ln:
                d.text((x, y), c, font=f, fill=t["color"])
                x += d.textlength(c, font=f) + t["spacing"] * t["size"] / 1000
            if t.get("strike"):
                sy = y + t["size"] * 0.58
                d.line([lx0, sy, lx0 + total, sy], fill=t["color"], width=max(2, int(t["size"] * 0.05)))
            y += t["size"] * 1.18 * t["lh"]
    out = os.path.join(OUT, f"{tid}.png")
    im.save(out)
    print(f"{tid} ({cat}, {len(texts)} texts) -> {out}")
