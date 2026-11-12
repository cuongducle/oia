#!/usr/bin/env python3
"""Rebuild review compositions from committed sources. No AI or network calls."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / 'assets'
SRC = HERE / 'sources'
OUT.mkdir(exist_ok=True)
BG = '#0e0d1f'
INK = '#f4f1e8'
MUTED = '#b3afcc'
ACCENT = '#ad98ff'
FONT = ROOT / 'site/fonts/archivo-latin-var.woff2'


def font(size, weight=400):
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_axes([weight if a['name'] == b'Weight' else a['default'] for a in f.get_variation_axes()])
    return f


def text(d, xy, value, size=24, fill=INK, weight=400):
    d.text(xy, value, font=font(size, weight), fill=fill)


def base(number, title, subtitle):
    im = Image.new('RGB', (1800, 1120), BG)
    d = ImageDraw.Draw(im)
    text(d, (64, 42), f'Oia  /  {number}', 22, ACCENT, 600)
    text(d, (64, 90), title, 62, weight=600)
    text(d, (66, 177), subtitle, 25, MUTED)
    return im, d


def place(im, path, box):
    source = Image.open(path).convert('RGB')
    fitted = ImageOps.contain(source, (box[2] - box[0], box[3] - box[1]), Image.Resampling.LANCZOS)
    xy = (box[0] + (box[2] - box[0] - fitted.width) // 2, box[1] + (box[3] - box[1] - fitted.height) // 2)
    im.paste(fitted, xy)


def save(im, name):
    im.save(OUT / f'{name}.webp', 'WEBP', quality=91, method=6)


def reference():
    im, d = base('01', 'Your product photo. A campaign worth posting.', 'A reference image gives the artwork a product to build around.')
    text(d, (66, 290), 'THE PRODUCT REFERENCE', 21, MUTED, 600)
    place(im, SRC / 'still-product.webp', (64, 338, 624, 898))
    d.line((680, 614, 782, 614), fill=ACCENT, width=3)
    d.line((768, 600, 782, 614, 768, 628), fill=ACCENT, width=3)
    text(d, (66, 945), 'Brief: a premium weekend coffee campaign.', 23)
    text(d, (862, 248), 'THE GENERATED CAMPAIGN', 21, MUTED, 600)
    place(im, SRC / 'still-campaign.webp', (862, 290, 1632, 1060))
    text(d, (66, 1025), 'Fictional STILL product. Both images AI-generated.', 19, MUTED)
    text(d, (66, 1055), 'Campaign uses the product as a reference.', 19, MUTED)
    save(im, '01-product-to-campaign')


def repaint():
    im, d = base('02', 'New offer. Same visual direction.', 'Ask for a change. Review the result before you apply it.')
    for x, source, label in [(64, 'mori-campaign.webp', 'BEFORE / 20% OFF'), (962, 'mori-repaint.webp', 'AFTER / 30% OFF')]:
        text(d, (x, 270), label, 21, MUTED, 600)
        place(im, ROOT / 'site/assets' / source, (x, 316, x + 734, 1050))
    text(d, (64, 1080), 'Reference-image repaint, about 1 image. Small image details can change; this is not a pixel lock.', 19, MUTED)
    d.line((840, 675, 918, 675), fill=ACCENT, width=3)
    d.line((904, 661, 918, 675, 904, 689), fill=ACCENT, width=3)
    save(im, '02-offer-edit')


def editor():
    im, d = base('03', 'A real canvas. Room to make it yours.', 'Native text, image layers and direct controls, inside the actual desktop app.')
    place(im, ROOT / 'site/assets/studio.webp', (64, 252, 1736, 1015))
    text(d, (64, 1050), 'Real Electron capture. The shipping note is a text layer; campaign lettering remains baked into the image.', 21, MUTED)
    save(im, '03-real-layer-editor')


def live():
    im, d = base('04', 'Keep the offer out of the interface.', 'Transparent livestream overlays, with safe-zone guides while you design.')
    # Exact crop of a real shot: the guide, artboard and offer remain unchanged.
    shot = Image.open(SRC / 'live-safe-zones.webp').convert('RGB')
    artboard = shot.crop((885, 160, 1600, 1425))
    crop = SRC / 'live-artboard-crop.webp'
    artboard.save(crop, 'WEBP', quality=95)
    place(im, crop, (970, 248, 1410, 1030))
    for y, head, body in [(350, '1080 x 1920', 'A transparent canvas for your stream.'), (530, 'Design around the controls', 'Keep important copy in the visible area.'), (710, 'Guides stay in the editor', 'Export the artwork, not the red guide lines.')]:
        text(d, (100, y), head, 34, weight=550)
        text(d, (100, y + 58), body, 24, MUTED)
    text(d, (64, 1060), 'Real Electron capture, cropped. TikTok zones are community-measured, not an official platform specification.', 20, MUTED)
    save(im, '04-live-safe-zones')


def mobile_variants():
    im = Image.new('RGB', (900, 1680), BG)
    d = ImageDraw.Draw(im)
    text(d, (48, 38), 'Oia / 01', 24, ACCENT, 600)
    text(d, (48, 92), 'Your product photo.', 48, weight=600)
    text(d, (48, 154), 'A campaign worth posting.', 48, weight=600)
    text(d, (48, 256), 'THE REFERENCE', 21, MUTED, 600)
    place(im, SRC / 'still-product.webp', (48, 302, 368, 622))
    text(d, (414, 386), 'A premium', 30)
    text(d, (414, 432), 'weekend coffee', 30)
    text(d, (414, 478), 'campaign.', 30)
    text(d, (48, 690), 'THE GENERATED CAMPAIGN', 21, MUTED, 600)
    place(im, SRC / 'still-campaign.webp', (48, 740, 852, 1544))
    text(d, (48, 1580), 'Fictional brand. Both images AI-generated.', 23, MUTED)
    text(d, (48, 1618), 'Campaign uses the product as a reference.', 23, MUTED)
    save(im, '01-product-to-campaign-mobile')
    im = Image.new('RGB', (900, 2100), BG)
    d = ImageDraw.Draw(im)
    text(d, (48, 38), 'Oia / 02', 24, ACCENT, 600)
    text(d, (48, 92), 'New offer.', 52, weight=600)
    text(d, (48, 158), 'Same visual direction.', 52, weight=600)
    for y, source, label in [(250, 'mori-campaign.webp', 'BEFORE / 20% OFF'), (1140, 'mori-repaint.webp', 'AFTER / 30% OFF')]:
        text(d, (48, y), label, 23, MUTED, 600)
        place(im, ROOT / 'site/assets' / source, (48, y + 44, 852, y + 848))
    text(d, (48, 2046), 'About 1 image. Fine details can change.', 23, MUTED)
    save(im, '02-offer-edit-mobile')


def styles():
    im, d = base('05', 'Different briefs. Distinct visual worlds.', 'Direct the mood, the palette and the composition. Not just a different colour filter.')
    place(im, ROOT / 'site/assets/mori-campaign.webp', (64, 300, 790, 1026))
    place(im, ROOT / 'site/assets/forma-editorial.webp', (1040, 270, 1650, 1032))
    text(d, (64, 248), 'MORI / MATCHA CAMPAIGN', 21, MUTED, 600)
    text(d, (1040, 225), 'FORMA / SKINCARE LAUNCH', 21, MUTED, 600)
    text(d, (64, 1070), 'Fictional campaign examples. Not bundled-template previews or proof of automatic brand consistency.', 20, MUTED)
    save(im, '05-art-direction')


if __name__ == '__main__':
    reference()
    repaint()
    editor()
    live()
    styles()
    mobile_variants()
    sheet = Image.new('RGB', (1600, 1740), '#17162a')
    d = ImageDraw.Draw(sheet)
    text(d, (40, 24), 'Oia / feature asset review', 36, weight=600)
    primary = [p for p in sorted(OUT.glob('0*.webp')) if not p.stem.endswith('-mobile')]
    for index, path in enumerate(primary):
        x, y = 40 + index % 2 * 780, 100 + index // 2 * 540
        place(sheet, path, (x, y, x + 740, y + 461))
        text(d, (x, y + 470), path.stem, 20, MUTED)
    sheet.save(OUT / 'contact-sheet.jpg', quality=94)
    manifest = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.is_file()}
    (HERE / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Built {len(manifest)} review assets')
