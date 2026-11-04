#!/usr/bin/env python3
"""T5 — generate the per-category template pages (SEO loop, Canva pattern adapted
to a static site). Manifest-driven: one page per TEMPLATE_CATEGORIES entry that
has studio coverage. Rerun after adding templates: python3 site/templates/build.py
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

MANIFEST = {
  "flash-sale": {
    "title": "Free Flash Sale Templates — editable price & date layers | Oia",
    "desc": "Flash sale banner templates with editable price, offer and deadline layers — coffee weekend, year-end blowout. Real scenes, native text. Free & open source.",
    "h1": "Flash sale templates",
    "lede": "The artwork is done; the offer is yours. Every price, percentage and deadline below is a native text layer — change 30% to 50% in one click, no regeneration, no cost.",
    "templates": [
      ("../../assets/flashsale.webp", "Weekend flash sale", "Espresso scene · price + dates as text layers"),
      ("../../assets/holiday.webp", "Year-end blowout", "Premium festive · offer + deadline layers"),
    ],
    "faqs": [
      ("How do I change the discount on a flash sale template?", "Click the price layer, type the new number. The typography treatment stays exactly as designed — that is the difference between an editable layer and baked pixels."),
      ("Can I turn a flash sale template into a countdown?", "Add a date or timer text layer in the editor, or generate a fresh countdown frame with the livestream overlay presets."),
    ],
  },
  "menu": {
    "title": "Free Menu Board Templates — edit items & prices like a doc | Oia",
    "desc": "Cafe and bakery menu templates where items and prices are editable text layers — update the board without redesigning it. Free & open source.",
    "h1": "Menu board templates",
    "lede": "Boards that survive a price change: the item list is a text layer, so today's croissant price is a one-line edit — not a redesign.",
    "templates": [
      ("../../assets/menuboard.webp", "Bakery & brew", "Items + prices you edit like a document"),
    ],
    "faqs": [
      ("Can I add more items to the menu?", "Yes — duplicate the item list layer or add a new text box; the scene is a real canvas, not a flat image."),
      ("Do menu templates print well?", "Export at PNG/PDF in the app at full resolution; the artwork ships at 1024×1536 and scales cleanly to boards."),
    ],
  },
  "social-post": {
    "title": "Free Social Post Templates — product launch & branding | Oia",
    "desc": "Social post templates for product launches and brand moments — headline, subtitle and CTA as editable layers. Free & open source.",
    "h1": "Social post templates",
    "lede": "Launch-day posts that read like a brand team made them: headline, subtitle and call-to-action each live on their own layer.",
    "templates": [
      ("../../assets/serum.webp", "Serum launch", "Headline + CTA layers, launch offer"),
      ("../../assets/botanical.webp", "A touch of nature", "Skincare still life, calm palette"),
    ],
    "faqs": [
      ("What sizes do the social templates export?", "Any — the canvas size is yours. Square 1:1, portrait 4:5 and 9:16 story presets are built into the composer."),
      ("Can I match my brand colors?", "Yes — store colors and fonts in a Brand Kit; the editor applies them to any template layer."),
    ],
  },
  "new-product": {
    "title": "Free Product Drop Templates — launch posts with editable copy | Oia",
    "desc": "Product drop templates: shoe and gadget launches with product name, drop date and early-access line as editable layers. Free & open source.",
    "h1": "Product drop templates",
    "lede": "Hype with the details left open: product name, drop date and the early-access line are layers — the design survives every restock.",
    "templates": [
      ("../../assets/sneaker.webp", "Product drop", "Name, drop date, early-access line"),
    ],
    "faqs": [
      ("Can I put MY product photo into a drop template?", "Yes — drop your photo in as a layer, or attach it as a reference image before generating a matching scene."),
      ("How do I localize a drop template?", "Every line is a text layer — retype in any language; Be Vietnam Pro ships with the app for full Vietnamese diacritics."),
    ],
  },
  "poster": {
    "title": "Free Poster Templates — editorial & festival posters | Oia",
    "desc": "Editorial and festival poster templates with real typographic layers — matcha editorial, music festival brutalism. Free & open source.",
    "h1": "Poster templates",
    "lede": "Posters with typographic opinions: serif editorial calm or swiss-grid brutalism — every headline sits on its own movable layer.",
    "templates": [
      ("../../assets/matcha.webp", "Matcha every day", "Cream serif headline as a native text layer"),
      ("../../assets/festival.webp", "City rhythms", "Brutalist photo, swiss-grid type"),
    ],
    "faqs": [
      ("Are the poster headlines real text?", "Yes — native text layers with real fonts, not pixels. Rewrite them in any language for free."),
      ("Can I publish my poster back as a template?", "Share ▸ Publish as template puts the current scene in your library for the next campaign."),
    ],
  },
  "deck": {
    "title": "Free Presentation Templates — minimal deck covers | Oia",
    "desc": "Presentation cover templates with editable title layers; export pages to PPTX from the same project. Free & open source.",
    "h1": "Presentation templates",
    "lede": "Covers that set the tone before slide two: minimal, typographic, and fully editable — then export the deck straight to PPTX.",
    "templates": [
      ("../../assets/perspective.webp", "A clearer perspective", "Minimal architecture cover"),
    ],
    "faqs": [
      ("Can a template become a full deck?", "Yes — add pages in the project, each with its own size; the outline mode plans the deck before painting a single image."),
      ("Does the PPTX export keep layers?", "Artwork renders onto slides as images; text layers you want native in PowerPoint are a copy-paste away."),
    ],
  },
}

NAV = ['flash-sale', 'menu', 'social-post', 'new-product', 'poster', 'deck']

def nav_html(current):
    return "\n".join(
        f'<a href="../{c}/"{" aria-current=\"page\"" if c == current else ""}>{ {"flash-sale":"Flash sale","menu":"Menu","social-post":"Social post","new-product":"New product","poster":"Poster","deck":"Presentation"}[c] }</a>'
        for c in NAV)

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0e0d1f">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://cuongducle.github.io/oia/assets/og-hero.png">
<meta property="og:url" content="https://cuongducle.github.io/oia/templates/{slug}/">
<link rel="canonical" href="https://cuongducle.github.io/oia/templates/{slug}/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wdth,wght@75..125,300..800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../styles.css">
<link rel="stylesheet" href="../../pages.css">
</head>
<body class="page">
<nav class="pageNav" aria-label="Main">
  <a class="brand" href="../../"><span class="o">◆ OIA</span></a>
  <div class="links">
    <a href="../../#workflow">How it works</a>
    <a href="../">All templates</a>
    <a href="../../prompts/">Prompt library</a>
    <a href="https://github.com/cuongducle/oia" rel="noopener">GitHub</a>
  </div>
  <a class="btn btn-accent" data-dl href="https://github.com/cuongducle/oia/releases">Download</a>
</nav>

<header class="pageHero">
  <p class="kicker"><a href="../">Templates</a> / {label}</p>
  <h1>{h1}</h1>
  <p class="lede">{lede}</p>
  <div class="ctaRow">
    <a class="btn btn-accent" data-dl href="https://github.com/cuongducle/oia/releases">Download Oia — free &amp; open source</a>
    <a class="btn btn-ghost" href="../">Browse all templates</a>
  </div>
</header>

<main class="pageMain">
  <nav class="catNav" aria-label="Template categories">
{nav}
  </nav>
  <div class="tplGrid">
{cards}
  </div>

  <div class="faq" style="margin-top:48px">
    <h2 class="catH" style="margin-top:0">{label} — questions</h2>
{faqs}
  </div>
</main>

<footer class="pageFooter">
  <a class="brand" href="../../"><span class="o">◆ OIA</span></a>
  <div class="links">
    <a href="../../">Home</a>
    <a href="../">Templates</a>
    <a href="../../prompts/">Prompt library</a>
    <a href="../../use-cases/flash-sale-banners/">Flash-sale banners</a>
  </div>
  <span class="meta">MIT · Oia — free &amp; open source</span>
</footer>
<script src="../../main.js" defer></script>
</body>
</html>
"""

LABELS = {"flash-sale": "Flash sale", "menu": "Menu", "social-post": "Social post",
          "new-product": "New product", "poster": "Poster", "deck": "Presentation"}

for slug, m in MANIFEST.items():
    cards = "\n".join(
        f'    <div class="tplCard"><img loading="lazy" src="{img}" alt="{name} template" width="300" height="450"><div class="body"><h3>{name}</h3><p>{note}</p></div></div>'
        for img, name, note in m["templates"])
    faqs = "\n".join(f'    <details><summary>{q}</summary><p>{a}</p></details>' for q, a in m["faqs"])
    html = PAGE.format(slug=slug, label=LABELS[slug], title=m["title"], desc=m["desc"],
                       h1=m["h1"], lede=m["lede"], cards=cards, faqs=faqs, nav=nav_html(slug))
    out = os.path.join(ROOT, slug)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "index.html"), "w") as f:
        f.write(html)
    print("wrote", slug)
print("done")
