#!/usr/bin/env python3
"""Rebuild site/assets/og-hero.png, the social-share card (1200×630).

Usage: python3 docs/screenshots/make-og.py   (from the repo root)
Inputs: site/assets/price-20.webp, price-30.webp + fonts in /tmp/oia-fonts.
Rules (2026-11 rework): exact 1200×630 (no crop when shared), NO fake buttons,
soft shadows only (no solid black panels behind rotated art).
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
BG = (14, 13, 31)
PAPER = (244, 241, 232)
MUTED = (179, 175, 204)
ACCENT = (165, 140, 255)
ACCENT_DEEP = (124, 92, 255)
FAINT = (152, 148, 181)

F = "/tmp/oia-fonts/"
anton = lambda px: ImageFont.truetype(F + "Anton-Regular.ttf", px)
archivo = lambda px: ImageFont.truetype(F + "Archivo[wdth,wght].ttf", px)
mono = lambda px: ImageFont.truetype(F + "JetBrainsMono[wght].ttf", px)

img = Image.new("RGB", (W, H), BG)
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
gd.ellipse([-260, -260, 560, 240], fill=(26, 21, 52))
gd.ellipse([860, 420, 1500, 860], fill=(23, 19, 45))
glow = glow.filter(ImageFilter.GaussianBlur(110))
img = Image.blend(img, glow, 0.75)
d = ImageDraw.Draw(img, "RGBA")

def spaced(draw, xy, text, font, fill, ls):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + ls
    return x

# ---- left: wordmark, headline, sub, marketplace chips ----
LX, LY = 64, 62
d.text((LX, LY), "◆", font=anton(24), fill=ACCENT_DEEP)
wm = d.textlength("◆", font=anton(24))
d.text((LX + wm + 10, LY - 2), "OIA", font=anton(26), fill=PAPER)

f_h = anton(62)
d.text((LX, LY + 58), "PROMO BANNERS", font=f_h, fill=PAPER)
d.text((LX, LY + 124), "FOR MARKETPLACE", font=f_h, fill=PAPER)
d.text((LX, LY + 190), "SELLERS.", font=f_h, fill=ACCENT)

sub = ("Free, open-source desktop studio, one sentence + your product photo, "
       "a finished sale banner you keep editing.")
f_sub = archivo(20)
words, lines, cur = sub.split(), [], ""
for w_ in words:
    t = (cur + " " + w_).strip()
    if d.textlength(t, font=f_sub) > 500:
        lines.append(cur); cur = w_
    else:
        cur = t
lines.append(cur)
y_sub = LY + 190 + 74
for i, ln in enumerate(lines):
    d.text((LX, y_sub + i * 29), ln, font=f_sub, fill=MUTED)

chips = ["SHOPEE", "LAZADA", "TIKTOK SHOP", "FREE · MIT"]
f_chip = mono(14)
cy = H - 96
cx = LX
for label in chips:
    tw = sum(d.textlength(c, font=f_chip) + 1.6 for c in label) - 1.6
    pw, ph = tw + 28, 32
    d.rounded_rectangle([cx, cy, cx + pw, cy + ph], radius=16, outline=(244, 241, 232, 40), width=1)
    spaced(d, (cx + 13, cy + 7), label, f_chip, (201, 198, 218), 1.6)
    cx += pw + 10

d.text((LX, H - 44), "oia.solutions", font=mono(14), fill=FAINT)

# ---- right: the repaint pair, soft shadows only ----
def load_poster(path, width):
    p = Image.open(path).convert("RGB")
    h = int(p.height * width / p.width)
    return p.resize((width, h), Image.LANCZOS)

def shadow_paste(base, im, xy, angle, glow_alpha=80):
    rot = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    sh = Image.new("RGBA", rot.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([0, 0, rot.width - 1, rot.height - 1], radius=14, fill=(124, 92, 255, glow_alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(56))
    pad = 22
    base.paste(sh, (xy[0] - pad + 3, xy[1] - pad + 7), sh)   # wide-blur glow, visible ring is pure gradient
    base.paste(rot, xy)

back = load_poster("site/assets/price-20.webp", 250)
front = load_poster("site/assets/price-30.webp", 310)
shadow_paste(img, back, (616, 112), -4.0, glow_alpha=70)
shadow_paste(img, front, (852, 200), 2.5)

img.save("site/assets/og-hero.png", optimize=True)
print("saved", img.size)
