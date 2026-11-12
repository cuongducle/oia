#!/usr/bin/env python3
"""Build marketing pages from the exported desktop catalog, never a parallel template list.

Refresh: pnpm --filter @oia/desktop template-qa
         python3 site/templates/export-previews.py
         python3 site/templates/build.py
Requires Pillow only for the preview export, not for this HTML build.
"""
import json
from collections import Counter
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATES = json.loads((HERE / 'catalog.json').read_text())
CATEGORIES = {
    'flash-sale': 'Flash sale', 'new-product': 'New product', 'livestream': 'Livestream',
    'menu': 'Menu', 'social-post': 'Social post', 'deck': 'Presentation',
    'poster': 'Poster', 'overlay': 'Overlay',
}
STYLES = {'editorial': 'Editorial', 'swiss': 'Swiss'}
PACKS = {'cafe-restaurant': 'Café & restaurant', 'product-launch': 'Product launch', 'tet-sale': 'Tết sale'}
COUNTS = Counter(t['category'] for t in TEMPLATES)
assert len(TEMPLATES) == 35 and set(COUNTS) == set(CATEGORIES)


def card(t, base):
    image = ''
    if t.get('image'):
        url = f"{base}assets/{t['image']}"
        image = (f'<a href="{url}" aria-label="View full-size {escape(t["name"], quote=True)}">'
                 f'<img loading="lazy" src="{url}" width="{t["width"]}" height="{t["height"]}" '
                 f'alt="Actual Oia template: {escape(t["name"], quote=True)}"></a>')
    note = 'Transparent canvas · editable text and shapes' if not image else 'Native text layers · real image artwork'
    if t['id'] == 'live-countdown':
        note = 'Static frame, not an animated timer · transparent export'
    return f'<article class="tplCard">{image}<div class="body"><h3>{escape(t["name"])}</h3><p>{t["width"]} × {t["height"]} · {note}</p></div></article>'


def grid(items, base):
    return '<div class="tplGrid">' + ''.join(card(t, base) for t in items) + '</div>'


def shell(title, description, body, base, url, heading=None):
    return f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} | Oia</title>
<meta name="description" content="{escape(description, quote=True)}">
<meta name="theme-color" content="#0e0d1f">
<link rel="icon" href="{base}favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:title" content="{escape(title, quote=True)} | Oia">
<meta property="og:description" content="{escape(description, quote=True)}">
<meta property="og:image" content="https://oia.solutions/assets/og-hero.png">
<meta property="og:url" content="https://oia.solutions/templates/{url}">
<link rel="canonical" href="https://oia.solutions/templates/{url}">
<link rel="stylesheet" href="{base}fonts/fonts.css"><link rel="stylesheet" href="{base}styles.css"><link rel="stylesheet" href="{base}pages.css">
</head><body class="page">
<nav class="pageNav" aria-label="Main"><a class="brand" href="{base}"><span class="o">◆ OIA</span></a>
<div class="links"><a href="{base}#workflow">How it works</a><a href="{base}templates/">Templates</a><a href="{base}prompts/">Prompt library</a><a href="https://github.com/cuongducle/oia">GitHub</a></div>
<a class="btn btn-accent" href="#download">Download</a></nav>
<header class="pageHero"><p class="kicker">The bundled library · v0.6.1</p><h1>{heading or escape(title)}</h1><p class="lede">{escape(description)}</p>
<div class="ctaRow download-options" id="download"><a class="btn btn-accent" data-dl="macArm64" href="https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-arm64.dmg">Download for macOS</a><a class="btn btn-accent" data-dl="win" href="https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-win-x64.exe">Download for Windows</a><a class="btn btn-ghost" href="{base}templates/">All 35 templates</a></div></header>
<main class="pageMain">{body}
<section class="faq" style="margin-top:48px"><h2>From template to your next campaign</h2>
<details><summary>Does opening a template spend image quota?</summary><p>No. The artwork ships with Oia. Opening a template, changing native text, arranging layers and exporting use no AI quota. Requesting new AI artwork uses your provider quota.</p></details>
<details><summary>Are these real previews?</summary><p>Yes. Each preview is rendered from the bundled scene using the same Fabric canvas engine as the desktop app. The gallery shows complete compositions, not cropped stock photos. Photographic backgrounds are AI-generated; copy remains native text.</p></details>
<details><summary>Can I save my own designs as templates?</summary><p>Yes. Use Share ▸ Publish as template in the editor to keep a reusable scene in your own library.</p></details>
</section></main>
<footer class="pageFooter"><a class="brand" href="{base}"><span class="o">◆ OIA</span></a><div class="links"><a href="{base}templates/">Templates</a><a href="{base}prompts/">Prompts</a><a href="{base}install/">Install help</a><a href="https://github.com/cuongducle/oia">GitHub</a></div><span class="meta">MIT · Oia, free &amp; open source</span></footer>
<script src="{base}main.js" defer></script>
</body></html>
'''


def write(url, title, description, body, base, heading=None):
    folder = HERE / url
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'index.html').write_text(shell(title, description, body, base, url, heading), encoding='utf-8')


nav = '<div class="catNav" role="group" aria-label="Template categories">' + ''.join(
    f'<a href="{slug}/">{label} · {COUNTS[slug]}</a>' for slug, label in CATEGORIES.items()) + '</div>'
facets = '<div class="catNav" role="group" aria-label="Styles and packs">' + ''.join(
    f'<a href="{kind}/{slug}/">{label}</a>' for kind, entries in (('styles', STYLES), ('packs', PACKS)) for slug, label in entries.items()) + '</div>'
body = '<p class="catNote">35 real scenes across eight categories. Select any image for a full-size preview. Transparent livestream and overlay graphics are listed without photographic mockups.</p>' + nav + facets
for slug, label in CATEGORIES.items():
    items = [t for t in TEMPLATES if t['category'] == slug]
    note = '<p class="catNote">Transparent compositing graphics for your own video. Safe-zone guides stay in the editor; the countdown is a static frame.</p>' if slug == 'livestream' else ''
    body += f'<h2 class="catH" id="{slug}"><a href="{slug}/">{label}</a> <span class="count">{len(items)}</span></h2>' + note + grid(items, '../')
write('', 'Free editable design templates', 'Start from 35 bundled scenes: sales, product launches, menus, social posts, posters, decks and transparent live graphics. Opening a template uses no AI quota.', body, '../', 'Start with real artwork.<br>Make the words yours.')

for slug, label in CATEGORIES.items():
    items = [t for t in TEMPLATES if t['category'] == slug]
    description = f'{len(items)} editable {label.lower()} templates included in Oia v0.6.1. Real scenes, native text layers, no image quota needed to open or edit.'
    write(f'{slug}/', f'{label} templates', description, grid(items, '../../'), '../../')
for kind, entries, field in (('styles', STYLES, 'style'), ('packs', PACKS, 'pack')):
    for slug, label in entries.items():
        items = [t for t in TEMPLATES if t[field] == slug]
        title = f'{label} ' + ('style templates' if kind == 'styles' else 'template pack')
        description = f'{len(items)} real editable scenes from the {label} collection, bundled with Oia v0.6.1. Choose a composition, change the copy, and export.'
        write(f'{kind}/{slug}/', title, description, grid(items, '../../../'), '../../../')
print(f'BUILT: catalog + {len(CATEGORIES)} categories + {len(STYLES)} styles + {len(PACKS)} packs. {len(TEMPLATES)} desktop scenes.')
