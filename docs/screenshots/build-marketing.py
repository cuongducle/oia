#!/usr/bin/env python3
"""Compose the README cover, social card and repaint proof from reviewed artwork.

Run from any directory: python3 docs/screenshots/build-marketing.py
Requires Pillow with FreeType WOFF2 support. No network or AI calls.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'site/assets'
FONT = ROOT / 'site/fonts/archivo-latin-var.woff2'
BG = '#0e0d1f'
PAPER = '#f4f1e8'
MUTED = '#b3afcc'


def font(size, weight=400):
    face = ImageFont.truetype(str(FONT), size)
    axes = face.get_variation_axes()
    face.set_variation_by_axes([weight if a['name'] == b'Weight' else a['default'] for a in axes])
    return face


def cover():
    canvas = Image.new('RGB', (1600, 820), BG)
    d = ImageDraw.Draw(canvas)
    d.text((64, 82), 'Oia', font=font(112, 650), fill=PAPER)
    d.multiline_text((68, 300), 'Your words.\nYour visual world.', font=font(48, 500), fill=PAPER, spacing=10)
    d.multiline_text((68, 470), 'The open-source banner studio\nfor marketplace sellers.', font=font(25), fill=MUTED, spacing=10)
    d.text((68, 718), 'macOS + Windows  /  Your own AI provider', font=font(18), fill=MUTED)
    campaign = Image.open(ASSETS / 'mori-campaign.webp').convert('RGB')
    editorial = Image.open(ASSETS / 'forma-editorial.webp').convert('RGB')
    canvas.paste(campaign.resize((580, 580), Image.Resampling.LANCZOS), (548, 150))
    canvas.paste(editorial.resize((360, 450), Image.Resampling.LANCZOS), (1152, 280))
    return canvas


def comparison():
    canvas = Image.new('RGB', (1600, 860), BG)
    d = ImageDraw.Draw(canvas)
    for x, name, label in [(32, 'mori-campaign.webp', 'BEFORE / 20% OFF'), (820, 'mori-repaint.webp', 'AFTER / 30% OFF')]:
        d.text((x, 22), label, font=font(22, 500), fill=PAPER)
        artwork = Image.open(ASSETS / name).convert('RGB')
        canvas.paste(artwork.resize((748, 748), Image.Resampling.LANCZOS), (x, 76))
    canvas.save(ASSETS / 'mori-comparison.webp', 'WEBP', quality=90, method=6)


if __name__ == '__main__':
    hero = cover()
    hero.save(ROOT / 'docs/screenshots/overview.png', optimize=True)
    # Same composition, padded to the standard social-card ratio, never cropped.
    social = Image.new('RGB', (1200, 630), BG)
    social.paste(hero.resize((1200, 615), Image.Resampling.LANCZOS), (0, 7))
    social.save(ASSETS / 'og-hero.png', optimize=True)
    comparison()
    print('Built overview.png, og-hero.png and mori-comparison.webp')
