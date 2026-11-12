#!/usr/bin/env python3
"""Integrity gate for the built site: internal links, anchors, unique ids, sitemap parity.

Catches the failure classes the media audit cannot see: a wrong relative base
(the exact bug shipped twice during the Astro port), duplicated DOM ids (three
id="download" once), dangling in-page anchors, and hand-maintained sitemap
entries drifting from the built routes. Run AFTER `pnpm --filter @oia/site build`.
"""
import argparse
import re
import tempfile
import unittest
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.urls = []  # (attribute, url, line)
        self.inert_links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'a' and not attrs.get('href') and not (attrs.get('id') or attrs.get('name')):
            self.inert_links.append(self.getpos()[0])
        for attr in ('href', 'src'):
            url = attrs.get(attr)
            if url:
                self.urls.append((attr, url, self.getpos()[0]))


def check(root):
    root = root.resolve()  # macOS tempdirs resolve through /private; keep one base
    dist = root / 'apps/site/dist'
    problems = []
    if not dist.is_dir():
        return ['apps/site/dist is missing: build the site before auditing (pnpm --filter @oia/site build)']

    pages = sorted(p for p in dist.rglob('*.html'))
    ids_by_page = {}
    for page in pages:
        parser = PageParser()
        parser.feed(page.read_text(encoding='utf-8'))
        rel = page.relative_to(dist)
        dupes = [i for i, n in Counter(parser.ids).items() if n > 1]
        for i in dupes:
            problems.append(f'{rel}: id "{i}" appears {Counter(parser.ids)[i]} times')
        ids_by_page[page] = set(parser.ids)
        for line in parser.inert_links:
            problems.append(f'{rel}:{line}: anchor has no href (inert link)')

    for page in pages:
        parser = PageParser()
        parser.feed(page.read_text(encoding='utf-8'))
        rel = page.relative_to(dist)
        for attr, url, line in parser.urls:
            split = urlsplit(url)
            if split.scheme in ('http', 'https', 'mailto', 'data'):
                continue
            if split.fragment and not split.path:
                if split.fragment not in ids_by_page[page]:
                    problems.append(f'{rel}:{line}: #{split.fragment} has no matching id on this page')
                continue
            if url.startswith('/'):
                target = (dist / unquote(split.path).lstrip('/')).resolve()
            else:
                target = (page.parent / unquote(split.path)).resolve()
            if not target.exists():
                problems.append(f'{rel}:{line}: {url} resolves to missing file {target.relative_to(root)}')
                continue
            if split.fragment:
                index = target / 'index.html' if target.is_dir() else target
                if index.suffix == '.html' and split.fragment not in ids_by_page.get(index, set()):
                    problems.append(f'{rel}:{line}: #{split.fragment} not found in {target.relative_to(root)}')

    sitemap = dist / 'sitemap.xml'
    if not sitemap.is_file():
        problems.append('sitemap.xml missing from the build')
    else:
        listed = set(re.findall(r'<loc>([^<]+)</loc>', sitemap.read_text()))
        for loc in listed:
            path = urlsplit(loc).path.lstrip('/')
            if not ((dist / path).exists() or (dist / path / 'index.html').exists()):
                problems.append(f'sitemap lists non-built URL: {loc}')
        built_urls = set()
        for page in pages:
            if page.name == '404.html':
                continue
            built_urls.add('/' + page.relative_to(dist).as_posix().removesuffix('index.html'))
        for url in built_urls:
            if f'https://oia.solutions{url}' not in listed and url.rstrip('/') != '':
                if url != '/':
                    problems.append(f'built page missing from sitemap: {url}')
    return problems


class SiteLinksTest(unittest.TestCase):
    def test_broken_link_anchor_and_duplicate_id_each_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / 'apps/site/dist'
            dist.mkdir(parents=True)
            (dist / 'sitemap.xml').write_text('<urlset><url><loc>https://oia.solutions/</loc></url></urlset>')
            (dist / 'index.html').write_text('<a href="gone/">x</a><a href="#top">y</a><p id="a">1</p><p id="a">2</p>')
            problems = check(root)
            self.assertTrue(any('gone/' in p for p in problems))
            self.assertTrue(any('#top' in p for p in problems))
            self.assertTrue(any('id "a"' in p for p in problems))
            (dist / 'index.html').write_text('<a href="./#">home</a>')
            self.assertEqual(check(root), [])

    def test_install_help_without_href_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / 'apps/site/dist'
            dist.mkdir(parents=True)
            (dist / 'sitemap.xml').write_text('<urlset><url><loc>https://oia.solutions/</loc></url></urlset>')
            for anchor in ('<a>Install help</a>', '<a href="">Install help</a>'):
                (dist / 'index.html').write_text(anchor)
                self.assertTrue(any('inert link' in p for p in check(root)))
            (dist / 'index.html').write_text('<a href="#guide">Install help</a><section id="guide">Steps</section>')
            self.assertEqual(check(root), [])

    def test_sitemap_parity_both_ways(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / 'apps/site/dist'
            dist.mkdir(parents=True)
            (dist / 'index.html').write_text('<p>ok</p>')
            (dist / 'x' / 'index.html').parent.mkdir(parents=True)
            (dist / 'x' / 'index.html').write_text('<p>ok</p>')
            (dist / 'sitemap.xml').write_text('<urlset><url><loc>https://oia.solutions/</loc></url><url><loc>https://oia.solutions/ghost/</loc></url></urlset>')
            problems = check(root)
            self.assertTrue(any('non-built URL' in p for p in problems))
            self.assertTrue(any('/x/' in p and 'missing from sitemap' in p for p in problems))

    def test_missing_build_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(len(check(Path(directory))), 1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(SiteLinksTest)
        raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
    problems = check(ROOT)
    if problems:
        raise SystemExit('SITE LINKS FAILED:\n' + '\n'.join(problems))
    print('SITE LINKS OK')
