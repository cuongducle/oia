#!/usr/bin/env python3
"""Package real Fabric renders. Run desktop template-qa before refreshing this catalog."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[3]
QA = ROOT / 'apps/desktop/out/template-qa'
ASSETS = ROOT / 'apps/site/public/assets'
DEST = ASSETS / 'templates'
DEST.mkdir(exist_ok=True)
report = json.loads((QA / 'report.json').read_text())
assert len(report) == 35
catalog = []
provenance = []
for row in report:
    assert not row['overflow'] and not row['collisions'], row['id']
    item = {key: row.get(key) for key in ('id', 'name', 'category', 'style', 'pack', 'width', 'height')}
    # Transparent compositing graphics belong in the library, not in a photographic gallery.
    if row['category'] not in ('livestream', 'overlay'):
        image = Image.open(QA / f"{row['id']}.png").convert('RGB')
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        image.save(DEST / f"{row['id']}.webp", quality=90, method=6)
        item['image'] = f"templates/{row['id']}.webp"
        provenance.append({
            'templateId': row['id'], 'asset': f"apps/site/public/assets/{item['image']}",
            'sourceSha256': hashlib.sha256((QA / f"{row['id']}.png").read_bytes()).hexdigest(),
            'previewSha256': hashlib.sha256((DEST / f"{row['id']}.webp").read_bytes()).hexdigest(),
        })
    catalog.append(item)

# The before/after is a native text edit, not a second generated image.
before = Image.open(QA / 'studio-ed-menu.png').convert('RGB')
after = Image.open(QA / 'menu-price-edited.png').convert('RGB')
proof = json.loads((QA / 'menu-price-proof.json').read_text())
price = next(box for box in proof['textBounds'] if box['name'] == '46.000₫')
changed = ImageChops.difference(before, after).getbbox()
assert changed is not None
assert price['left'] - 2 <= changed[0] and price['top'] - 2 <= changed[1]
assert changed[2] <= price['left'] + price['width'] + 2
assert changed[3] <= price['top'] + price['height'] + 2
assert not proof['overflow'] and not proof['collisions']
after.save(DEST / 'menu-price-edited.webp', quality=90, method=6)

(ROOT / 'apps/site/src/data/catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'docs/verification/template-marketing-assets.json').write_text(json.dumps({
    'release': 'v0.6.1', 'renderer': 'apps/desktop/scripts/template-qa-renderer.ts',
    'sceneSource': 'apps/desktop/src/shared/bundled-templates.ts',
    'transform': 'Complete Fabric scene render, proportional resize to at most 1600 pixels, WebP quality 90. No crop, repaint or synthetic UI.',
    'previews': provenance,
    'nativeEdit': {
        'templateId': 'studio-ed-menu', 'replacement': {'42.000₫': '46.000₫'},
        'asset': 'apps/site/public/assets/templates/menu-price-edited.webp',
        'sourceSha256': hashlib.sha256((QA / 'menu-price-edited.png').read_bytes()).hexdigest(),
        'previewSha256': hashlib.sha256((DEST / 'menu-price-edited.webp').read_bytes()).hexdigest(),
        'changedPixelBoundsBeforeCompression': changed,
        'note': 'Source PNG pixels are identical outside this price region. Public WebP previews use lossy compression.',
    },
}, ensure_ascii=False, indent=2) + '\n')
print(f'PACKAGED: {len(catalog)} catalog entries, 30 native previews, one verified text edit. Changed pixels: {changed}')
