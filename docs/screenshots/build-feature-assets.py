#!/usr/bin/env python3
"""Compose feature media from committed outputs; --refresh-editable imports private render outputs."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'site/assets'
REVIEW = ROOT / 'site/feature-review'
PRIVATE = ROOT / 'docs/private/surgepix-feature-audit-2026-11-09/landing-sample'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--refresh-editable', action='store_true')
args = parser.parse_args()
font_path = ROOT / 'site/fonts/archivo-latin-var.woff2'
font = ImageFont.truetype(str(font_path), 26)
outputs = []

def save(image, name):
    image.save(OUT / name, 'WEBP', quality=92, method=6)
    outputs.append(name)

for name in ['still-product.webp', 'still-campaign.webp']:
    save(Image.open(REVIEW / 'sources' / name), name)
save(Image.open(REVIEW / 'sources/live-artboard-crop.webp'), 'livestream-safe-zones.webp')
panels = [('sample-original.png', 'editable-text-before.webp', 'Baked-in poster'),
          ('reconstructed.png', 'editable-text-rebuilt.webp', 'Editable layers rebuilt'),
          ('edited.png', 'editable-text-edited.webp', 'Price and day edited')]
for source, output, label in panels:
    if args.refresh_editable:
        save(Image.open(PRIVATE / source).convert('RGB'), output)
    else:
        if not (OUT / output).is_file():
            raise SystemExit('Missing committed editable output; use --refresh-editable with private evidence available.')
        outputs.append(output)
board = Image.new('RGB', (1488, 680), '#f4efe6')
d = ImageDraw.Draw(board)
for i, (_, source, label) in enumerate(panels):
    x = i * 504
    board.paste(ImageOps.contain(Image.open(OUT / source).convert('RGB'), (480, 600)), (x, 56))
    d.text((x + 4, 14), label, fill='#241610', font=font)
save(board, 'editable-text-sample.webp')
manifest = {
    'description': 'Derived images, not new AI calls. Editable samples use product createEditor and textarea input events, never harness width overrides.',
    'evidence': {
        'still': 'site/feature-review/provenance.json; fictional product, direct Codex image outputs, not a complete Oia agent run',
        'livestream': 'crop of real Electron shot, community-measured guides, not an exported overlay',
        'editable': 'private audit landing-sample: saved paid OCR/plate, rerendered through corrected product code with zero new quota',
    },
    'files': {name: {'sha256': hashlib.sha256((OUT / name).read_bytes()).hexdigest(), 'bytes': (OUT / name).stat().st_size,
                      'size': list(Image.open(OUT / name).size)} for name in outputs},
}
(ROOT / 'docs/verification/feature-assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Built {len(outputs)} feature assets')
