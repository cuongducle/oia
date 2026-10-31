#!/usr/bin/env python3
"""Single source for the Oia icon artwork (macos-design-2026).

One geometry constant set feeds BOTH renditions, so the macOS-26 layered icon
(mark.png inside AppIcon.icon) and the legacy .icns can never drift apart:
- mark.png: transparent canvas, white serif O + dot — the system supplies the
  background and the glass treatment.
- icon.icns / icon_1024.png: the same mark scaled into the purple gradient
  squircle (Big Sur template, ~824/1024 with transparent margin).

Regenerate after touching MARK_* constants:
  python3 apps/desktop/scripts/build-icon-assets.py
"""
import io
import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(HERE, "..", "resources", "icons")
SERIF = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"

# --- ONE geometry (fractions of the 1024 canvas, mark space) -----------------
MARK_FONT = 620          # serif O size on the 1024 canvas
MARK_LIFT = 40           # px the O sits above center
DOT_R = 55
DOT_X, DOT_Y = 735, 762  # clear of the O's stroke, lower-right

INNER = 824              # squircle side inside 1024 (macOS icon template)
S = 1024


def draw_mark(d: ImageDraw.ImageDraw, scale: float, dx: float, dy: float) -> None:
    f = ImageFont.truetype(SERIF, int(MARK_FONT * scale))
    bbox = d.textbbox((0, 0), "O", font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((dx - w / 2 - bbox[0], dy - h / 2 - bbox[1] - MARK_LIFT * scale), "O", font=f, fill=(255, 255, 255, 255))
    r = DOT_R * scale
    cx, cy = dx + (DOT_X - S / 2) * scale, dy + (DOT_Y - S / 2) * scale
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(239, 235, 251, 255))


def render_mark_png() -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), 1.0, S / 2, S / 2)
    out = os.path.join(ICONS, "AppIcon.icon", "Assets", "mark.png")
    img.save(out)
    print(f"mark.png → {out}")


def render_icns() -> None:
    off = (S - INNER) / 2
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(INNER * 0.2237)
    box = [off, off, off + INNER - 1, off + INNER - 1]
    d.rounded_rectangle(box, radius=r, fill=(84, 52, 191, 255))
    grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(int(off), int(off + INNER)):
        t = (y - off) / INNER
        gd.line([(off, y), (off + INNER, y)], fill=(int(118 + 76 * t), int(88 + 46 * t), int(235 + 160 * t), 255))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=r, fill=255)
    img.paste(grad, (0, 0), mask)
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([off - 150, off - 280, off + INNER + 150, off + 320], fill=(255, 255, 255, 24))
    img = Image.alpha_composite(img, hl.filter(ImageFilter.GaussianBlur(36)))
    draw_mark(ImageDraw.Draw(img), INNER / S, S / 2, S / 2)
    img.save(os.path.join(ICONS, "icon_1024.png"))

    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "oia.iconset")
        os.makedirs(iconset)
        for sz in (16, 32, 64, 128, 256, 512, 1024):
            img.resize((sz, sz), Image.LANCZOS).save(os.path.join(iconset, f"icon_{sz}x{sz}.png"))
        for sz in (32, 64, 128, 256, 512):
            img.resize((sz * 2, sz * 2), Image.LANCZOS).save(os.path.join(iconset, f"icon_{sz}x{sz}@2x.png"))
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(ICONS, "icon.icns")], check=True)
    print(f"icon.icns + icon_1024.png → {ICONS}")


if __name__ == "__main__":
    render_mark_png()
    render_icns()
