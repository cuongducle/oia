#!/usr/bin/env python3
"""One-off porter: wraps the legacy content pages into Astro page components."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / 'site'
OUT = ROOT / 'apps/site/src/pages'

PAGES = {
    'install/index.html': ('install.astro', '../'),
    'prompts/index.html': ('prompts.astro', '../'),
    'use-cases/flash-sale-banners/index.html': ('use-cases/flash-sale-banners.astro', '../../'),
    'use-cases/livestream-overlays/index.html': ('use-cases/livestream-overlays.astro', '../../'),
    'use-cases/presentations/index.html': ('use-cases/presentations.astro', '../../'),
}

def grab(pattern, text, default=''):
    m = re.search(pattern, text, re.S)
    if not m:
        return default
    return (m.groups()[-1] if m.groups() else m.group(0)).strip()

for src, (dst, base) in PAGES.items():
    html = (SITE / src).read_text()
    title = grab(r'<title>(.*?)</title>', html)
    description = grab(r'<meta name="description" content="(.*?)"', html)
    og_title = grab(r'property="og:title" content="(.*?)"', html)
    og_desc = grab(r'property="og:description" content="(.*?)"', html)
    canonical = grab(r'<link rel="canonical" href="(.*?)"', html)

    nav_block = grab(r'(<nav class="pageNav".*?</nav>)', html)
    links = [f"{{ href: '{h}', label: '{re.sub('&amp;', '&', l)}' }}"
             for h, l in re.findall(r'<a href="([^"]+)">([^<]+)</a>', nav_block)]
    footer_block = grab(r'(<footer class="pageFooter".*?</footer>)', html)
    footer_links = [f"{{ href: '{h}', label: '{re.sub('&amp;', '&', l)}' }}"
                    for h, l in re.findall(r'<a href="([^"]+)">([^<]+)</a>', footer_block)]

    body = grab(r'</nav>\n(.*)<footer class="pageFooter"', html)
    trailing = [s for s in re.findall(r'<script>(.*?)</script>', html.split('</footer>')[1] if '</footer>' in html else '', re.S) if s.strip()]

    bare = re.sub(r'<script.*?</script>|<pre.*?</pre>', '', body, flags=re.S)
    assert '{' not in bare and '}' not in bare, f'{src}: braces in template body'

    depth = base.count('..')
    assert depth >= 0
    layout = '../' * (1 + dst.count('/')) + 'layouts/Page.astro'
    front = (
        '---\n'
        f"import Page from '{layout}';\n"
        '---\n'
        '\n'
        '<Page\n'
        f"  title=\"{title}\"\n"
        f"  description=\"{description}\"\n"
        f"  ogTitle=\"{og_title}\"\n"
        f"  ogDescription=\"{og_desc}\"\n"
        f"  canonical=\"{canonical}\"\n"
        f"  base=\"{base}\"\n"
        f"  links={{[{', '.join(links)}]}}\n"
        f"  footerLinks={{[{', '.join(footer_links)}]}}\n"
        '>\n'
    )
    scripts = '\n\n'.join(f'<script>{s.strip()}</script>' for s in trailing if s.strip())
    out = front + body.strip() + '\n</Page>\n' + (scripts + '\n' if scripts else '')
    (OUT / dst).write_text(out)
    print(f'{dst}: {len(body)} bytes body, {len(trailing)} trailing script(s)')
