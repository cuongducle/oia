#!/usr/bin/env python3
"""Rebuild docs/screenshots/banner.png (README hero), deterministic PIL composite.

Usage: python3 docs/screenshots/make-banner.py   (from the repo root)
Inputs: site/assets/price-20.webp, price-30.webp + fonts in /tmp/oia-fonts
(Anton/Archivo/JetBrains Mono TTFs from github.com/google/fonts, ofl/anton etc.)
Output: /tmp/banner-final.png, copy over docs/screenshots/banner.png, then QA
at GitHub render width (~830px) before committing.

2026-11 rework: seller-first headline, even vertical balance (no empty bottom
half), soft shadows only, mono labels sized to survive the ~52% GitHub downscale.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1600, 600
BG = (14, 13, 31)          # #0e0d1f
PAPER = (244, 241, 232)    # #f4f1e8
MUTED = (179, 175, 204)    # #b3afcc
ACCENT = (165, 140, 255)   # #a58cff, small-text-safe accent
ACCENT_DEEP = (124, 92, 255)
GREEN = (142, 240, 166)    # #8ef0a6
FAINT = (152, 148, 181)    # #9894b5

F = "/tmp/oia-fonts/"
anton = lambda px: ImageFont.truetype(F + "Anton-Regular.ttf", px)
archivo = lambda px: ImageFont.truetype(F + "Archivo[wdth,wght].ttf", px)
mono = lambda px: ImageFont.truetype(F + "JetBrainsMono[wght].ttf", px)

img = Image.new("RGB", (W, H), BG)

# ---- glows (two soft radial accents) ----
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
gd.ellipse([-250, -300, 650, 260], fill=(26, 21, 52))
gd.ellipse([1150, 480, 1900, 900], fill=(23, 19, 45))
glow = glow.filter(ImageFilter.GaussianBlur(120))
img = Image.blend(img, glow, 0.75)

d = ImageDraw.Draw(img, "RGBA")

# ---- card ----
M = 28
d.rounded_rectangle([M, M, W - M, H - M], radius=14, outline=(244, 241, 232, 23), width=1)

def spaced(draw, xy, text, font, fill, ls):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + ls
    return x

# ================= LEFT COLUMN =================
LX = M + 56          # 84
LY = 128

# wordmark
d.text((LX, LY), "◆", font=anton(22), fill=ACCENT_DEEP)
wm = d.textlength("◆", font=anton(22))
d.text((LX + wm + 10, LY - 2), "OIA", font=anton(24), fill=PAPER)

# headline: seller-first
h1a, h1b = "THE BANNER STUDIO", "FOR MARKETPLACE SELLERS"
f_h = anton(58)
y_h = LY + 54
d.text((LX, y_h), h1a, font=f_h, fill=PAPER)
d.text((LX, y_h + 64), h1b, font=f_h, fill=ACCENT)

# sub (wrapped)
sub = ("Free, open-source desktop app (macOS + Windows). One sentence + your product photo, "
       "a finished Shopee, Lazada or TikTok Shop banner you can keep editing.")
f_sub = archivo(19)
y_sub = y_h + 64 + 72
words, lines, cur = sub.split(), [], ""
for w_ in words:
    t = (cur + " " + w_).strip()
    if d.textlength(t, font=f_sub) > 560:
        lines.append(cur); cur = w_
    else:
        cur = t
lines.append(cur)
for i, ln in enumerate(lines):
    d.text((LX, y_sub + i * 28), ln, font=f_sub, fill=MUTED)
y_after_sub = y_sub + len(lines) * 28

# ---- bottom row: chips left, tag right: fills the lower band ----
chips = [("SHOPEE", False), ("LAZADA", False), ("TIKTOK SHOP", False), ("MAC + WINDOWS", False), ("MIT", False)]
f_chip = mono(16)
cy = 468
cx = LX
for label, on in chips:
    tw = sum(d.textlength(c, font=f_chip) + 1.8 for c in label) - 1.8
    pw, ph = tw + 30, 34
    d.rounded_rectangle([cx, cy, cx + pw, cy + ph], radius=16, outline=(244, 241, 232, 40), width=1)
    spaced(d, (cx + 14, cy + 8), label, f_chip, (201, 198, 218), 1.8)
    cx += pw + 10

# ================= RIGHT COLUMN: the repaint pair =================
def load_poster(path, width):
    p = Image.open(path).convert("RGB")
    h = int(p.height * width / p.width)
    return p.resize((width, h), Image.LANCZOS)

p20 = load_poster("site/assets/price-20.webp", 262)
p30 = load_poster("site/assets/price-30.webp", 262)

def shadow_paste(base, im, xy, angle):
    rot = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    sh = Image.new("RGBA", rot.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([0, 0, rot.width - 1, rot.height - 1], radius=14, fill=(124, 92, 255, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(60))
    pad = 22
    base.paste(sh, (xy[0] - pad + 3, xy[1] - pad + 7), sh)   # wide-blur glow, the visible ring is pure gradient
    base.paste(rot, xy)

RX = 856
base_y = 138
shadow_paste(img, p20, (RX, base_y + 26), 3.5)
shadow_paste(img, p30, (RX + 262 + 128, base_y - 6), -3.0)

# arrow under the pair: one repaint apart
ax0, ax1 = RX + 20, RX + 262 + 128 + 262 - 20
ay = 508
d.line([ax0, ay, ax1 - 12, ay], fill=ACCENT_DEEP, width=3)
d.line([ax1 - 26, ay - 10, ax1 - 10, ay], fill=ACCENT_DEEP, width=3)
d.line([ax1 - 26, ay + 10, ax1 - 10, ay], fill=ACCENT_DEEP, width=3)
cap = "REAL GENERATIONS · ONE REPAINT APART, SAME STYLE, NEW PRICE"
tw = sum(d.textlength(c, font=mono(16)) + 1.6 for c in cap) - 1.6
spaced(d, ((ax0 + ax1) / 2 - tw / 2, ay + 16), cap, mono(16), MUTED, 1.6)

# badge (auto-refined)
bt = "AUTO-REFINED · ROUND 1"
f_b = mono(16)
btw = sum(d.textlength(c, font=f_b) + 1.4 for c in bt) - 1.4
bw, bh = btw + 44, 38
bx, by = W - M - 44 - bw, 64
d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=18, fill=(17, 15, 33, 235), outline=(142, 240, 166, 110), width=1)
d.ellipse([bx + 15, by + bh / 2 - 4, bx + 23, by + bh / 2 + 4], fill=GREEN)
spaced(d, (bx + 32, by + 11), bt, f_b, GREEN, 1.4)

img.save("/tmp/banner-final.png", optimize=True)
print("saved", img.size)
