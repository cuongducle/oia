#!/usr/bin/env python3
"""Rebuild docs/screenshots/banner.png (README hero) — deterministic PIL composite.

Usage: python3 docs/screenshots/make-banner.py   (from the repo root)
Inputs: site/assets/price-20.webp, price-30.webp + fonts in /tmp/oia-fonts
(Anton/Archivo/JetBrains Mono TTFs from github.com/google/fonts — ofl/anton etc.)
Output: /tmp/banner-final.png — copy over docs/screenshots/banner.png, then QA
at GitHub render width (~830px) before committing.
"""
#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1600, 640
BG = (14, 13, 31)          # #0e0d1f
PAPER = (244, 241, 232)    # #f4f1e8
MUTED = (163, 160, 184)    # #a3a0b8
ACCENT = (124, 92, 255)    # #7c5cff
GREEN = (142, 240, 166)    # #8ef0a6
FAINT = (111, 108, 133)    # #6f6c85
CHIP_TXT = (201, 198, 218)

F = "/tmp/oia-fonts/"
anton = lambda px: ImageFont.truetype(F + "Anton-Regular.ttf", px)
archivo = lambda px: ImageFont.truetype(F + "Archivo[wdth,wght].ttf", px)
mono = lambda px: ImageFont.truetype(F + "JetBrainsMono[wght].ttf", px)

img = Image.new("RGB", (W, H), BG)

# ---- glows (two soft radial accents) ----
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
gd.ellipse([-250, -300, 650, 260], fill=(26, 21, 52))     # top-left purple-ish
gd.ellipse([1150, 480, 1900, 900], fill=(23, 19, 45))     # bottom-right
glow = glow.filter(ImageFilter.GaussianBlur(120))
img = Image.blend(img, glow, 0.75)

d = ImageDraw.Draw(img, "RGBA")

# ---- card ----
M = 28
d.rounded_rectangle([M, M, W - M, H - M], radius=14, outline=(244, 241, 232, 23), width=1)

# ================= LEFT COLUMN =================
LX = M + 56
LY = 108

# wordmark
d.text((LX, LY), "◆", font=anton(22), fill=ACCENT)
wm = d.textlength("◆", font=anton(22))
d.text((LX + wm + 10, LY), "OIA", font=anton(24), fill=PAPER)

# headline
h1a, h1b = "GENERATE THE IMAGE.", "KEEP THE CONTROL."
f_h = anton(62)
d.text((LX, LY + 46), h1a, font=f_h, fill=PAPER)
d.text((LX, LY + 46 + 66), h1b, font=f_h, fill=ACCENT)

# sub (wrapped, simple greedy wrap)
sub = "Free, open-source desktop studio — AI artwork on a real, layer-based canvas. Generate, refine, then edit the design like a designer, not a prompter."
f_sub = archivo(18)
words, lines, cur = sub.split(), [], ""
for w_ in words:
    t = (cur + " " + w_).strip()
    if d.textlength(t, font=f_sub) > 520:
        lines.append(cur); cur = w_
    else:
        cur = t
lines.append(cur)
for i, ln in enumerate(lines):
    d.text((LX, LY + 46 + 148 + i * 27), ln, font=f_sub, fill=MUTED)

# chips
def spaced(draw, xy, text, font, fill, ls):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + ls
    return x

chips = [("RESEARCH THE WEB", True), ("AUTO REFINE", True), ("EDITABLE LAYERS", False),
         ("MAC + WINDOWS", False), ("MIT", False)]
f_chip = mono(13)
cx, cy = LX, LY + 46 + 148 + 3 * 27 + 14
row_h = 0
for label, on in chips:
    tw = sum(d.textlength(c, font=f_chip) + 1.6 for c in label) - 1.6
    pw, ph = tw + 28, 32
    if cx + pw > LX + 580:
        cx = LX; cy += 44
    col = GREEN if on else CHIP_TXT
    bd = (142, 240, 166, 100) if on else (244, 241, 232, 40)
    d.rounded_rectangle([cx, cy, cx + pw, cy + ph], radius=14, outline=bd, width=1)
    spaced(d, (cx + 13, cy + 7), label, f_chip, col, 1.6)
    cx += pw + 10

# ================= RIGHT COLUMN =================
def load_poster(path, width):
    p = Image.open(path).convert("RGB")
    h = int(p.height * width / p.width)
    return p.resize((width, h), Image.LANCZOS)

p20 = load_poster("site/assets/price-20.webp", 268)
p30 = load_poster("site/assets/price-30.webp", 268)

def shadow_paste(base, im, xy, angle):
    rot = im.rotate(angle, expand=True, resample=Image.BICUBIC)
    sh = Image.new("RGBA", rot.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([0, 0, rot.width - 1, rot.height - 1], radius=10, fill=(0, 0, 0, 180))
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    pad = 30
    base.paste(Image.new("RGB", (1, 1), BG), (0, 0))  # no-op keep type
    base.paste(sh, (xy[0] - pad + 8, xy[1] - pad + 14), sh)
    base.paste(rot, xy)

RCX = 820  # start x of the cluster inside card coords
base_y = 170
shadow_paste(img, p20, (RCX + 10, base_y + 14), 3.5)     # rotate() is CCW-positive
shadow_paste(img, p30, (RCX + 10 + 268 + 140, base_y - 6), -3.0)

# arrow between posters: from right edge of p20 to left edge of p30
ay = base_y + 150
ax0, ax1 = RCX + 10 + 268 + 18, RCX + 10 + 268 + 140 - 18
d.line([ax0, ay, ax1 - 10, ay], fill=ACCENT, width=3)
d.line([ax1 - 22, ay - 9, ax1 - 8, ay], fill=ACCENT, width=3)
d.line([ax1 - 22, ay + 9, ax1 - 8, ay], fill=ACCENT, width=3)
cap = "ONE REPAINT"
tw = sum(d.textlength(c, font=mono(13)) + 1.5 for c in cap) - 1.5
spaced(d, ((ax0 + ax1) / 2 - tw / 2, ay + 14), cap, mono(13), MUTED, 1.5)

# badge (auto-refined)
bt = "AUTO-REFINED · ROUND 1"
f_b = mono(14)
btw = sum(d.textlength(c, font=f_b) + 1.2 for c in bt) - 1.2
bw, bh = btw + 48, 40
bx, by = W - M - 44 - bw, 64
d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=18, fill=(17, 15, 33, 235), outline=(142, 240, 166, 110), width=1)
d.ellipse([bx + 16, by + bh / 2 - 4, bx + 24, by + bh / 2 + 4], fill=GREEN)
spaced(d, (bx + 33, by + 12), bt, f_b, GREEN, 1.2)

# bottom-right tag
tag = "REAL GENERATIONS · 20% → 30% BY PROMPT"
tw = sum(d.textlength(c, font=mono(12)) + 1.6 for c in tag) - 1.6
spaced(d, (W - M - 40 - tw, H - M - 42), tag, mono(12), FAINT, 1.6)

img.save("/tmp/banner-final.png", optimize=True)
print("saved", img.size)
