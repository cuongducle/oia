#!/usr/bin/env python3
"""SC-3 programmatic style plates — Editorial × Swiss backgrounds, 0 quota.

Deterministic (seeded) PIL generator for the clean-plate artworks of the
social-card style templates (docs/designs/social-card-style-presets.md).
Style rules only — no text is baked (doctrine T2: clean plates, text lives
in editable Textbox blocks). Rerun to regenerate byte-identical assets:

    python3 scripts/gen-style-plates.py   (from apps/desktop)
"""
import os, random
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "../src/renderer/public/studio")
os.makedirs(PUB, exist_ok=True)
random.seed(20261106)

PAPER = (250, 250, 248)
INK = (10, 10, 10)
GREY = (212, 212, 210)


def new(w, h, base):
    return Image.new("RGB", (w, h), base)

def overlay(img, layer, alpha):
    return Image.blend(img, layer, alpha)

def radial(img, cx, cy, radius, color, alpha):
    layer = Image.new("RGB", img.size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    mask = layer.convert("L").point(lambda v: int(v / 255 * alpha * 255))
    black = Image.new("RGB", img.size, (0, 0, 0))
    return Image.composite(Image.new("RGB", img.size, color), img,
                           Image.composite(mask, Image.new("L", img.size, 0), mask))

def grain(img, strength=0.10, light=False):
    n = Image.effect_noise(img.size, 24).convert("RGB")
    if light:
        return overlay(img, n, strength * 0.6)
    dark = Image.new("RGB", img.size, (0, 0, 0))
    mask = n.convert("L").point(lambda v: int(abs(v - 128) / 128 * strength * 255))
    return Image.composite(dark, img, mask)

def dots(img, x0, y0, x1, y1, pitch=13, r=1.6, color=INK, alpha=90):
    d = ImageDraw.Draw(img, "RGBA")
    y = y0
    while y < y1:
        x = x0
        while x < x1:
            d.ellipse([x - r, y - r, x + r, y + r], fill=color + (alpha,))
            x += pitch
        y += pitch

def crosses(img, x0, y0, x1, y1, pitch=26, s=5, color=INK, alpha=70):
    d = ImageDraw.Draw(img, "RGBA")
    y = y0
    while y < y1:
        x = x0
        while x < x1:
            d.line([x - s, y - s, x + s, y + s], fill=color + (alpha,), width=2)
            d.line([x - s, y + s, x + s, y - s], fill=color + (alpha,), width=2)
            x += pitch
        y += pitch

def hairline_h(img, x0, x1, y, color=GREY, width=1):
    d = ImageDraw.Draw(img)
    d.line([x0, y, x1, y], fill=color, width=width)

def save(img, name):
    img.save(os.path.join(PUB, f"{name}.webp"), "WEBP", quality=88)
    print(name, img.size)

# ---------- Swiss plates (flat paper + sparse geometry, text zones clean) ----------

# 1. flashsale 4:5 — dot field bottom-right only; top stays quiet for display text
img = new(1080, 1350, PAPER)
dots(img, 660, 1000, 1080, 1260)
hairline_h(img, 60, 1020, 1310)
save(img, "swiss-flashsale")

# 2. spec 1:1 — cross-hatch block bottom-left, hairline rail right
img = new(1080, 1080, PAPER)
crosses(img, 620, 850, 1020, 960, pitch=24)
hairline_h(img, 60, 1020, 1022)
save(img, "swiss-spec")

# 3. statement 16:9 — dots top-right band + double hairline base
img = new(1600, 900, PAPER)
dots(img, 1060, 170, 1600, 420)
hairline_h(img, 100, 1500, 884)
hairline_h(img, 100, 1500, 890)
save(img, "swiss-statement")

# ---------- Editorial plates (paper + grain + ink wash, never flat) ----------

# 4. menu 4:5 — kraft paper, warm washes, vignette
img = new(1080, 1350, (232, 214, 182))
img = radial(img, 260, 200, 420, (196, 152, 92), 0.22)
img = radial(img, 900, 1150, 460, (160, 116, 66), 0.18)
img = radial(img, 540, 675, 900, (120, 84, 44), 0.10)
img = grain(img, 0.12)
save(img, "ed-menu")

# 5. feature 1:1 — dune palette, soft topo rings
img = new(1080, 1080, (238, 228, 210))
d = ImageDraw.Draw(img, "RGBA")
for i, r in enumerate(range(140, 620, 60)):
    a = max(6, 16 - i)
    d.ellipse([760 - r, 300 - r * 0.62, 760 + r, 300 + r * 0.62], outline=(176, 150, 108, a), width=2)
img = img.filter(ImageFilter.GaussianBlur(1.2))
img = radial(img, 300, 850, 500, (200, 174, 128), 0.14)
img = grain(img, 0.10)
save(img, "ed-feature")

# 6. holiday 4:5 — midnight ink, gilt wash, warm specks (dark variant)
img = new(1080, 1350, (30, 27, 22))
img = radial(img, 300, 260, 480, (196, 148, 70), 0.16)
img = radial(img, 820, 380, 300, (196, 148, 70), 0.10)
img = radial(img, 880, 1120, 520, (12, 10, 8), 0.30)
img = grain(img, 0.16, light=True)
d = ImageDraw.Draw(img, "RGBA")
hairline_h(img, 60, 1020, 1252, (110, 90, 60), 1)
save(img, "ed-holiday")


# ---------- TẾT pack plates (SC-5 full-pack build, 2026-11-07) ----------
# swiss-tet: flat Tết red field + sparse gold-cap dots bottom-right
img = new(1080, 1350, (200, 16, 46))
d = ImageDraw.Draw(img, "RGBA")
for i, r in enumerate(range(80, 320, 44)):
    d.ellipse([880 - r, 240 - r * 0.5, 880 + r, 240 + r * 0.5], outline=(212, 175, 55, 14), width=2)
hairline_h(img, 60, 1020, 1290, (244, 214, 124), 1)
save(img, "tet-red")

# tet-gold: flat gold field + red hairlines (for lì xì / voucher card)
img = new(1080, 1080, (250, 208, 44))
hairline_h(img, 60, 1020, 1014, (178, 24, 34), 1)
save(img, "tet-gold")

print("tết plates done — 0 quota")

