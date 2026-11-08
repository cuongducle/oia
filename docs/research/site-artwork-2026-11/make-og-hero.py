#!/usr/bin/env python3
"""Rebuild site/assets/og-hero.png (social preview) from the NEW artwork set.

1600x779 — matches the previous og file's shape. Left: brand copy on the site's
dark navy; right: a layered stack of the new hero plates + the price pair,
styled like the landing hero's draggable layers (chips + dashed selection).
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
A = os.path.join(REPO, "site/assets")
W, H = 1600, 779
BG = (14, 13, 31)
PAPER = (244, 241, 232)
MUTED = (163, 160, 184)
ACCENT = (124, 92, 255)

F = "/tmp/oia-fonts/"
anton = lambda px: ImageFont.truetype(F + "Anton-Regular.ttf", px)
archivo = lambda px: ImageFont.truetype(F + "Archivo[wdth,wght].ttf", px)
mono = lambda px: ImageFont.truetype(F + "JetBrainsMono[wght].ttf", px)

img = Image.new("RGB", (W, H), BG)
glow = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(glow)
for cx, cy, r, col in [(320, 180, 420, (36, 30, 78)), (1300, 640, 480, (24, 44, 66))]:
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
glow = glow.filter(ImageFilter.GaussianBlur(120))
img = Image.blend(img, glow, 0.55)
d = ImageDraw.Draw(img)

d.text((70, 96), "◆ OIA", font=mono(30), fill=ACCENT)
d.text((72, 168), "GENERATE THE IMAGE.", font=anton(76), fill=PAPER)
d.text((72, 254), "KEEP THE CONTROL.", font=anton(76), fill=PAPER)
d.text((74, 372), "FREE & OPEN SOURCE · MIT · SELF-HOSTED", font=mono(22), fill=MUTED)
d.text((74, 404), "BYO PROVIDER · MAC + WINDOWS", font=mono(22), fill=MUTED)

btn = ImageDraw.Draw(img)
btn.rounded_rectangle([72, 470, 292, 528], 14, fill=ACCENT)
btn.text((104, 484), "Download", font=archivo(24), fill=(255, 255, 255))
btn.rounded_rectangle([312, 470, 532, 528], 14, outline=(90, 88, 116), width=2)
btn.text((344, 484), "View on GitHub", font=archivo(24), fill=PAPER)

def tile(src, box, angle=0, chip=None):
    im = Image.open(src).convert("RGB")
    im = im.resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
    if angle:
        im = im.rotate(angle, expand=True, fillcolor=BG, resample=Image.BICUBIC)
        # keep inside the reserved zone after rotation
        im = im.crop((im.width - (box[2] - box[0]) // 2 - (box[2] - box[0]) // 2, 0, im.width - (box[2] - box[0]) // 2 + (box[2] - box[0]), (box[3] - box[1])))
    img.paste(im, (box[0], box[1]))
    if chip:
        d.rounded_rectangle([box[0], box[3] + 10, box[0] + d.textlength(chip, font=mono(17)) + 22, box[3] + 42], 7, fill=(24, 22, 44), outline=(70, 66, 96))
        d.text((box[0] + 11, box[3] + 16), chip, font=mono(17), fill=(201, 198, 218))

tile(f"{A}/matcha.webp", (700, 96, 950, 429), chip="matcha · plate")
tile(f"{A}/botanical.webp", (990, 210, 1216, 511), angle=-4, chip="lumea · plate")
tile(f"{A}/price-30.webp", (1272, 330, 1530, 590), angle=5, chip="30% off · repaint")

d = ImageDraw.Draw(img)
d.text((700, 700), "real artwork — generated + edited in one canvas", font=mono(19), fill=(120, 117, 142))

img.save(f"{A}/og-hero.png")
print("saved", img.size)
