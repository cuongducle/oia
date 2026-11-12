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
    site = root / 'site'
    missing = []
    count = 0
    for page in [*sorted(site.rglob('*.html')), root / 'README.md']:
        if not page.exists():
            continue
        parser = MediaParser()
        parser.feed(page.read_text(encoding='utf-8'))
        for url in parser.urls:
            parsed = urlsplit(url)
            if parsed.scheme and parsed.hostname != 'oia.solutions':
                continue
            path = unquote(parsed.path)
            target = site / path.lstrip('/') if path.startswith('/') else page.parent / path
            if not path:
                continue
            count += 1
            if not target.is_file():
                missing.append(f'{page.relative_to(root)}: {url}')
    catalog_path = site / 'templates/catalog.json'
    if catalog_path.exists():
        provenance_path = root / 'docs/verification/template-marketing-assets.json'
        if not provenance_path.exists():
            missing.append('Missing template-preview provenance manifest')
        else:
            provenance = json.loads(provenance_path.read_text())
            expected = {row['id']: f"site/assets/{row['image']}" for row in json.loads(catalog_path.read_text()) if row.get('image')}
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
            nested = root / 'site/templates/packs/cafe'
            nested.mkdir(parents=True)
            (nested / 'index.html').write_text('<img src="../../../assets/deleted.webp"><meta property="og:image" content="https://oia.solutions/assets/deleted.png">')
            count, missing = check(root)
            self.assertEqual(count, 2)
            self.assertEqual(len(missing), 2)

    def test_readme_and_encoded_existing_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / 'site/assets'
            assets.mkdir(parents=True)
            (assets / 'a b.webp').write_bytes(b'image')
            (root / 'site/index.html').write_text('<img src="assets/a%20b.webp?version=2">')
            (root / 'README.md').write_text('<img src="site/assets/a b.webp">')
            self.assertEqual(check(root), (2, []))
            (assets / 'a b.webp').unlink()
            self.assertEqual(len(check(root)[1]), 2)

    def test_template_preview_substitution_or_missing_provenance_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'site/templates').mkdir(parents=True)
            asset = root / 'site/assets/template.webp'
            asset.parent.mkdir()
            asset.write_bytes(b'verified renderer output')
            (root / 'site/templates/catalog.json').write_text(json.dumps([{'id': 'real-template', 'image': 'template.webp'}]))
            self.assertEqual(len(check(root)[1]), 1)
            manifest = root / 'docs/verification/template-marketing-assets.json'
            manifest.parent.mkdir(parents=True)
            row = {'templateId': 'real-template', 'asset': 'site/assets/template.webp', 'previewSha256': hashlib.sha256(asset.read_bytes()).hexdigest()}
            manifest.write_text(json.dumps({'previews': [row], 'nativeEdit': row}))
            self.assertEqual(check(root), (0, []))
            asset.write_bytes(b'unrelated replacement picture')
            self.assertTrue(check(root)[1])

    def test_remote_media_is_not_treated_as_local(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'site').mkdir()
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
