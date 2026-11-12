#!/usr/bin/env python3
"""Check local marketing media references, including social cards and nested pages."""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class MediaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        keys = {'img': ['src'], 'source': ['src'], 'video': ['src', 'poster']}.get(tag, [])
        if tag == 'meta' and (attrs.get('property') == 'og:image' or attrs.get('name') == 'twitter:image'):
            keys = ['content']
        for key in keys:
            if attrs.get(key):
                self.urls.append(attrs[key])
        if tag in ('img', 'source') and attrs.get('srcset'):
            self.urls.extend(item.strip().split()[0] for item in attrs['srcset'].split(','))


def check(root):
    # Built output is what ships; the audit runs after `pnpm --filter @oia/site build`.
    dist = root / 'apps/site/dist'
    missing = []
    count = 0
    for page in [*sorted(dist.rglob('*.html')), root / 'README.md']:
        if not page.exists():
            continue
        text = page.read_text(encoding='utf-8')
        if 'data-dl=' in text and 'main.js' not in text:
            missing.append(f'{page.relative_to(root)}: download buttons without the latest-release resolver (main.js)')
        parser = MediaParser()
        parser.feed(text)
        for url in parser.urls:
            parsed = urlsplit(url)
            if parsed.scheme and parsed.hostname != 'oia.solutions':
                continue
            path = unquote(parsed.path)
            target = dist / path.lstrip('/') if path.startswith('/') else page.parent / path
            if not path:
                continue
            count += 1
            if not target.is_file():
                missing.append(f'{page.relative_to(root)}: {url}')
    catalog_path = root / 'apps/site/src/data/catalog.json'
    if catalog_path.exists():
        provenance_path = root / 'docs/verification/template-marketing-assets.json'
        if not provenance_path.exists():
            missing.append('Missing template-preview provenance manifest')
        else:
            provenance = json.loads(provenance_path.read_text())
            expected = {row['id']: f"apps/site/public/assets/{row['image']}" for row in json.loads(catalog_path.read_text()) if row.get('image')}
            actual = {row['templateId']: row['asset'] for row in provenance['previews']}
            if expected != actual:
                missing.append('Template catalog and preview provenance do not match')
            for row in [*provenance['previews'], provenance['nativeEdit']]:
                asset = root / row['asset']
                if not asset.is_file() or hashlib.sha256(asset.read_bytes()).hexdigest() != row['previewSha256']:
                    missing.append(f"Template preview missing or changed without re-export: {row['asset']}")
    return count, missing


class MediaReferencesTest(unittest.TestCase):
    def test_deleted_nested_media_and_social_card_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nested = root / 'apps/site/dist/templates/packs/cafe'
            nested.mkdir(parents=True)
            (nested / 'index.html').write_text('<img src="../../../assets/deleted.webp"><meta property="og:image" content="https://oia.solutions/assets/deleted.png">')
            count, missing = check(root)
            self.assertEqual(count, 2)
            self.assertEqual(len(missing), 2)

    def test_readme_and_encoded_existing_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / 'apps/site/public/assets'
            assets.mkdir(parents=True)
            (assets / 'a b.webp').write_bytes(b'image')
            # the built copy is what the HTML audit scans
            built = root / 'apps/site/dist/assets'
            built.mkdir(parents=True)
            (built / 'a b.webp').write_bytes(b'image')
            (root / 'apps/site/dist/index.html').write_text('<img src="assets/a%20b.webp?version=2">')
            (root / 'README.md').write_text('<img src="apps/site/public/assets/a b.webp">')
            self.assertEqual(check(root), (2, []))
            (assets / 'a b.webp').unlink()
            (built / 'a b.webp').unlink()
            self.assertEqual(len(check(root)[1]), 2)

    def test_template_preview_substitution_or_missing_provenance_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asset = root / 'apps/site/public/assets/template.webp'
            asset.parent.mkdir(parents=True)
            asset.write_bytes(b'verified renderer output')
            (root / 'apps/site/src/data').mkdir(parents=True)
            (root / 'apps/site/src/data/catalog.json').write_text(json.dumps([{'id': 'real-template', 'image': 'template.webp'}]))
            self.assertEqual(len(check(root)[1]), 1)
            manifest = root / 'docs/verification/template-marketing-assets.json'
            manifest.parent.mkdir(parents=True)
            row = {'templateId': 'real-template', 'asset': 'apps/site/public/assets/template.webp', 'previewSha256': hashlib.sha256(asset.read_bytes()).hexdigest()}
            manifest.write_text(json.dumps({'previews': [row], 'nativeEdit': row}))
            self.assertEqual(check(root), (0, []))
            asset.write_bytes(b'unrelated replacement picture')
            self.assertTrue(check(root)[1])

    def test_download_buttons_without_resolver_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            page = root / 'apps/site/dist'
            page.mkdir(parents=True)
            (page / 'index.html').write_text('<a data-dl="win" href="https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-win-x64.exe">Download</a>')
            self.assertEqual(len(check(root)[1]), 1)
            (page / 'index.html').write_text('<a data-dl="win" href="x">d</a><script src="main.js" defer></script>')
            self.assertEqual(check(root)[1], [])

    def test_remote_media_is_not_treated_as_local(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'apps/site/dist').mkdir(parents=True)
            (root / 'README.md').write_text('<img src="https://img.shields.io/example"><img src="data:image/png;base64,AAAA">')
            self.assertEqual(check(root), (0, []))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(MediaReferencesTest)
        raise SystemExit(not unittest.TextTestRunner().run(suite).wasSuccessful())
    count, missing = check(ROOT)
    if missing:
        raise SystemExit('Missing marketing media:\n' + '\n'.join(missing))
    print(f'MARKETING_ASSETS OK: {count} local media references')
