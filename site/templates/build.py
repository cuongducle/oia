#!/usr/bin/env python3
"""T5: generate the per-category template pages (SEO loop, Canva pattern adapted
to a static site). Manifest-driven: one page per TEMPLATE_CATEGORIES entry that
has studio coverage. Rerun after adding templates: python3 site/templates/build.py
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

MANIFEST = {
  "flash-sale": {
    "title": "Free Flash Sale Templates: editable price & date layers | Oia",
    "desc": "Flash sale banner templates with editable price, offer and deadline layers, coffee weekend, year-end blowout. Real scenes, native text. Free & open source.",
    "h1": "Flash sale templates",
    "lede": "The artwork is done; the offer is yours. Every price, percentage and deadline below is a native text layer, change 30% to 50% in one click, no regeneration, no cost.",
    "templates": [
      ("../../assets/flashsale.webp", "Weekend flash sale", "Espresso scene · price + dates as text layers"),
      ("../../assets/holiday.webp", "Year-end blowout", "Premium festive · offer + deadline layers"),
    ],
    "faqs": [
      ("How do I change the discount on a flash sale template?", "Click the price layer, type the new number. The typography treatment stays exactly as designed, that is the difference between an editable layer and baked pixels."),
      ("Can I turn a flash sale template into a countdown?", "Add a date or timer text layer in the editor, or generate a fresh countdown frame with the livestream overlay presets."),
    ],
  },
  "menu": {
    "title": "Free Menu Board Templates: edit items & prices like a doc | Oia",
    "desc": "Cafe and bakery menu templates where items and prices are editable text layers, update the board without redesigning it. Free & open source.",
    "h1": "Menu board templates",
    "lede": "Boards that survive a price change: the item list is a text layer, so today's croissant price is a one-line edit, not a redesign.",
    "templates": [
      ("../../assets/menuboard.webp", "Bakery & brew", "Items + prices you edit like a document"),
    ],
    "faqs": [
      ("Can I add more items to the menu?", "Yes, duplicate the item list layer or add a new text box; the scene is a real canvas, not a flat image."),
      ("Do menu templates print well?", "Export at PNG/PDF in the app at full resolution; the artwork ships at 1024×1536 and scales cleanly to boards."),
    ],
  },
  "social-post": {
    "title": "Free Social Post Templates: product launch & branding | Oia",
    "desc": "Social post templates for product launches and brand moments, headline, subtitle and CTA as editable layers. Free & open source.",
    "h1": "Social post templates",
    "lede": "Launch-day posts that read like a brand team made them: headline, subtitle and call-to-action each live on their own layer.",
    "templates": [
      ("../../assets/serum.webp", "Serum launch", "Headline + CTA layers, launch offer"),
      ("../../assets/botanical.webp", "A touch of nature", "Skincare still life, calm palette"),
    ],
    "faqs": [
      ("What sizes do the social templates export?", "Any, the canvas size is yours. Square 1:1, portrait 4:5 and 9:16 story presets are built into the composer."),
      ("Can I match my brand colors?", "Yes, store colors and fonts in a Brand Kit; the editor applies them to any template layer."),
    ],
  },
  "new-product": {
    "title": "Free Product Drop Templates: launch posts with editable copy | Oia",
    "desc": "Product drop templates: shoe and gadget launches with product name, drop date and early-access line as editable layers. Free & open source.",
    "h1": "Product drop templates",
    "lede": "Hype with the details left open: product name, drop date and the early-access line are layers, the design survives every restock.",
    "templates": [
      ("../../assets/sneaker.webp", "Product drop", "Name, drop date, early-access line"),
    ],
    "faqs": [
      ("Can I put MY product photo into a drop template?", "Yes, drop your photo in as a layer, or attach it as a reference image before generating a matching scene."),
      ("How do I localize a drop template?", "Every line is a text layer, retype in any language; Be Vietnam Pro ships with the app for full Vietnamese diacritics."),
    ],
  },
  "poster": {
    "title": "Free Poster Templates: editorial & festival posters | Oia",
    "desc": "Editorial and festival poster templates with real typographic layers, matcha editorial, music festival brutalism. Free & open source.",
    "h1": "Poster templates",
    "lede": "Posters with typographic opinions: serif editorial calm or swiss-grid brutalism, every headline sits on its own movable layer.",
    "templates": [
      ("../../assets/matcha.webp", "Matcha every day", "Cream serif headline as a native text layer"),
      ("../../assets/festival.webp", "City rhythms", "Brutalist photo, swiss-grid type"),
    ],
    "faqs": [
      ("Are the poster headlines real text?", "Yes, native text layers with real fonts, not pixels. Rewrite them in any language for free."),
      ("Can I publish my poster back as a template?", "Share ▸ Publish as template puts the current scene in your library for the next campaign."),
    ],
  },
  "deck": {
    "title": "Free Presentation Templates: minimal deck covers | Oia",
    "desc": "Presentation cover templates with editable title layers; export pages to PPTX from the same project. Free & open source.",
    "h1": "Presentation templates",
    "lede": "Covers that set the tone before slide two: minimal, typographic, and fully editable, then export the deck straight to PPTX.",
    "templates": [
      ("../../assets/perspective.webp", "A clearer perspective", "Minimal architecture cover"),
    ],
    "faqs": [
      ("Can a template become a full deck?", "Yes, add pages in the project, each with its own size; the outline mode plans the deck before painting a single image."),
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
<meta property="og:image" content="https://oia.solutions/assets/og-hero.png">
<meta property="og:url" content="https://oia.solutions/templates/{slug}/">
<link rel="canonical" href="https://oia.solutions/templates/{slug}/">
<link rel="stylesheet" href="../../fonts/fonts.css">
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
    <a class="btn btn-accent" data-dl href="https://github.com/cuongducle/oia/releases">Download Oia, free &amp; open source</a>
    <a class="btn btn-ghost" href="../">Browse all templates</a>
  </div>
</header>

<main class="pageMain">
  <nav class="catNav" aria-label="Template categories">
{nav}
  </nav>
  <p class="catNote">A text index of templates included in the app. Open Oia to preview and edit the actual scenes.</p>
  <div class="tplGrid">
{cards}
  </div>

  <div class="faq" style="margin-top:48px">
    <h2 class="catH" style="margin-top:0">{label}: questions</h2>
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
  <span class="meta">MIT · Oia, free &amp; open source</span>
</footer>
<script src="../../main.js" defer></script>
</body>
</html>
"""

LABELS = {"flash-sale": "Flash sale", "menu": "Menu", "social-post": "Social post",
          "new-product": "New product", "poster": "Poster", "deck": "Presentation"}

for slug, m in MANIFEST.items():
    cards = "\n".join(
        f'    <div class="tplCard"><div class="body"><h3>{name}</h3><p>{note}</p></div></div>'
        for _artwork, name, note in m["templates"])
    faqs = "\n".join(f'    <details><summary>{q}</summary><p>{a}</p></details>' for q, a in m["faqs"])
    html = PAGE.format(slug=slug, label=LABELS[slug], title=m["title"], desc=m["desc"],
                       h1=m["h1"], lede=m["lede"], cards=cards, faqs=faqs, nav=nav_html(slug))
    out = os.path.join(ROOT, slug)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "index.html"), "w") as f:
        f.write(html)
    print("wrote", slug)

# ---- SC-4 + SC-5 (social-card-style-presets.md): style facet pages + pack pages.
# Packs are the SEO differentiator: every AI-plated card shows the exact prompt
# that grew it (provenance from apps/desktop/src/shared/template-provenance.ts).

STYLES = {
  "editorial": {
    "title": "Editorial Templates: magazine-style cafés, menus & boutiques | Oia",
    "desc": "Editorial magazine-style templates: serif display type, italic decks, textured warm paper. Café menus, street-food posters, boutique posts, every line editable. Free & open source.",
    "h1": "Editorial templates",
    "lede": "The magazine look, minus the magazine budget: serif headlines, quiet italic decks, warm textured paper. Built for cafés, restaurants and boutiques that want to look considered.",
    "templates": [
      ("../../assets/ed-menu3.webp", "Weekend brunch", "Photographic plate + Georgia serif, prices as text"),
      ("../../assets/ed-menu.webp", "Café menu · kraft paper", "Procedural kraft grain, Vietnamese-ready type"),
      ("../../assets/ed-street.webp", "Morning phở", "Street-food poster, Vietnamese sample copy"),
      ("../../assets/ed-fashion.webp", "The linen edit", "Boutique post, right text column"),
      ("../../assets/ed-product2.webp", "First light serum", "Still life on travertine"),
      ("../../assets/ed-holiday2.webp", "Candlelit gift", "Dark editorial for year-end sets"),
      ("../../assets/ed-poster2.webp", "Thrown by hand", "Atelier poster, sunlit wall"),
      ("../../assets/ed-feature.webp", "Field notes", "Quiet statement card on dune paper"),
    ],
    "faqs": [
      ("What makes a template “editorial”?", "Three laws the design system enforces: a serif display headline with a quiet italic subhead, a warm paper background with real texture (never flat), and restrained color. A critic inside the app scores generated images against these laws."),
      ("Can the editorial look carry Vietnamese text?", "Yes, the app ships Be Vietnam Pro with full diacritics, and several templates already carry Vietnamese sample copy (phở poster, café menu)."),
    ],
  },
  "swiss": {
    "title": "Swiss Style Templates: product launches & data statements | Oia",
    "desc": "Swiss International style templates: strict grids, very large light type, one accent color. Product spec sheets, drop announcements, data statements, every number editable. Free & open source.",
    "h1": "Swiss style templates",
    "lede": "One accent, hairline rules, type so large it has to be light. The engineered look for product launches and statements that need to feel decided.",
    "templates": [
      ("../../assets/swiss-sneaker.webp", "Veloce Two", "Klein blue field, one yellow accent"),
      ("../../assets/swiss-bottle.webp", "Everyday bottle", "Lemon field, spec rows, blue price"),
      ("../../assets/swiss-spec.webp", "Product spec sheet", "Spec rows on hairline rails"),
      ("../../assets/swiss-flashsale.webp", "Clearance 50%", "Light display type, struck old price"),
      ("../../assets/swiss-statement.webp", "Post consistently", "16:9 statement card with stats"),
    ],
    "faqs": [
      ("What are the Swiss style rules?", "Exactly one saturated accent used in one place; display type is very large and very light; flat surfaces only, no gradients, shadows or rounded corners. The app's critic enforces these on generated images."),
      ("Which sizes do Swiss templates ship in?", "Square 1:1, portrait 4:5 and 16:9, all three are built-in size presets in the editor."),
    ],
  },
}

PACKS = {
  "cafe-restaurant": {
    "title": "Café & Restaurant Pack: menu, brunch & street-food templates | Oia",
    "desc": "A curated pack for cafés and restaurants: menu boards, brunch posts, street-food posters and a year-end gift set, with the exact AI prompts that grew each plate. Free & open source.",
    "h1": "Café & restaurant pack",
    "lede": "Six templates covering a season of service: the menu board that survives price changes, the brunch post, the street-food hero, the gift set. Swap dishes and prices as text layers, never redesign.",
    "templates": [
      ("../../assets/menuboard.webp", "Bakery menu board", "Items + prices as document-like text"),
      ("../../assets/ed-menu3.webp", "Weekend brunch", "AI plate + editorial type"),
      ("../../assets/ed-menu.webp", "Café menu · kraft", "Warm paper, VN-ready"),
      ("../../assets/ed-street.webp", "Morning phở", "Street poster, VN copy"),
      ("../../assets/ed-holiday2.webp", "Candlelit gift set", "Dark editorial, order-by date layer"),
    ],
    "prompts": [
      ("Weekend brunch", "a tight cluster of cafe breakfast items ALL confined to the BOTTOM THIRD, the entire TOP TWO THIRDS plain warm terracotta backdrop…"),
      ("Morning phở", "a steaming bowl of pho on a worn wooden stool at golden hour, food in the BOTTOM THIRD, plain cement-grey above…"),
      ("Candlelit gift", "holiday still life on dark midnight background, candlelight from the left, empty lower third for text…"),
    ],
    "faqs": [
      ("What is a pack, exactly?", "A curated bundle: templates that share a niche, plus the provenance, the real generation prompt behind every AI plate, so you can rerun the look on your own dishes."),
      ("Can I regenerate a plate with MY food?", "Yes, copy the provenance prompt into the composer, describe your dish where the prompt names the plate's subject, and pick the editorial style preset."),
    ],
  },
  "product-launch": {
    "title": "Product Launch Pack: drop posts, spec sheets & debut cards | Oia",
    "desc": "A curated pack for product launches: drop announcements, spec sheets, debut posts in two styles, with the exact AI prompts that grew each plate. Free & open source.",
    "h1": "Product launch pack",
    "lede": "Six templates for launch week: the drop post, the spec sheet, the statement card, the serum still life. Names, dates and prices are layers; the plates grow from recorded prompts.",
    "templates": [
      ("../../assets/sneaker.webp", "Product drop", "Name, drop date, early access"),
      ("../../assets/swiss-sneaker.webp", "Veloce Two · Swiss", "Klein blue, one accent"),
      ("../../assets/swiss-spec.webp", "Spec sheet · Swiss", "Hairline spec rails"),
      ("../../assets/swiss-bottle.webp", "Everyday bottle · Swiss", "Lemon field, blue price"),
      ("../../assets/ed-product2.webp", "First light serum", "Editorial still life"),
      ("../../assets/serum.webp", "Serum launch", "Headline + CTA layers"),
    ],
    "prompts": [
      ("Veloce Two", "a single white sneaker floating on a completely flat Klein blue background, one hard diagonal shadow, top two thirds pure flat blue…"),
      ("Everyday bottle", "a matte white cosmetic bottle on a completely flat lemon yellow background, one hard vertical shadow…"),
      ("First light serum", "skincare serum bottle on warm travertine stone, one green leaf shadow, large empty left half…"),
    ],
    "faqs": [
      ("Do the packs cost anything?", "No, the app and every template are free and open source. The pack pages exist so launch-week has one link with everything in order."),
      ("How do I reuse a plate's look for my product?", "Each AI plate lists its provenance prompt. Paste it into the composer, swap the subject (sneaker → your product), keep the composition clauses, and pick the same style preset."),
    ],
  },
}

PACKS["tet-sale"] = {
    "title": "Tết Sale Pack: flash sale, quà Tết & voucher templates | Oia",
    "desc": "A complete Tết pack: crimson flash sales, gift-basket posters, bánh chưng menu boards, lì xì vouchers, Vietnamese copy, real prompts. Free & open source.",
    "h1": "Tết sale pack",
    "lede": "Sáu mẫu cho cả mùa Tết: giảm giá đầu xuân, giỏ quà, menu bếp xuân, thiệp chúc, voucher lì xì. Đổi giá và ngày hạn bằng text layer, thiết kế giữ nguyên.",
    "templates": [
      ("../../assets/tet-flashsale.webp", "Tết sale 40%", "Crimson editorial, struck old price"),
      ("../../assets/tet-gift.webp", "Giỏ quà Tết", "Dark editorial, gold light"),
      ("../../assets/tet-menu.webp", "Bếp xuân", "Bánh chưng menu, VN prices"),
      ("../../assets/tet-greeting.webp", "Chúc xuân", "Mai blossom, serif greeting"),
      ("../../assets/tet-red.webp", "Tết sale 50% · Swiss", "Flat đỏ, one gold accent"),
      ("../../assets/tet-gold.webp", "Lì xì voucher · Swiss", "Flat vàng, red code"),
    ],
    "prompts": [
      ("Tết sale 40%", "red and gold lucky money envelopes with a kumquat tree, ALL objects in the BOTTOM THIRD, plain deep crimson above…"),
      ("Giỏ quà Tết", "woven basket with tea, dried fruits and a red ribbon, warm golden light, basket in the BOTTOM RIGHT quarter…"),
      ("Bếp xuân", "banh chung cakes tied with bamboo strings on a wooden tray, food in the BOTTOM THIRD, plain warm cream above…"),
      ("Chúc xuân", "a single branch of yellow apricot blossom in a ceramic vase, vase in the BOTTOM RIGHT quarter…"),
    ],
    "faqs": [
      ("Mẫu Tết có dựng sẵn chữ tiếng Việt chưa?", "Có, toàn bộ copy mẫu là tiếng Việt đầy đủ dấu, chỉnh sửa như tài liệu. Font Be Vietnam Pro đi kèm app."),
      ("Tôi làm quà Tết riêng, dùng lại look này thế nào?", "Mỗi plate AI kèm provenance prompt, dán vào composer, thay mô tả giỏ quà bằng sản phẩm của bạn, giữ nguyên các mệnh đề bố cục (đồ ở dưới, sạch phía trên), chọn style Editorial."),
      ("Pack này có thu phí không?", "Không, app và toàn bộ template miễn phí, mã nguồn mở."),
    ],
  }

PROMPT_SECTION = """
  <div class="faq" style="margin-top:48px">
    <h2 class="catH" style="margin-top:0">Grown from real prompts</h2>
    <p class="lede" style="font-size:15px">These plates are not stock. Each grew from a recorded prompt, rerun it on your own subject:</p>
{prompt_items}
  </div>
"""

for base, manifest in (("styles", STYLES), ("packs", PACKS)):
    for slug, m in manifest.items():
        cards = "\n".join(
            f'    <div class="tplCard"><div class="body"><h3>{name}</h3><p>{note}</p></div></div>'
            for _artwork, name, note in m["templates"])
        faqs = "\n".join(f'    <details><summary>{q}</summary><p>{a}</p></details>' for q, a in m["faqs"])
        prompts = ""
        if "prompts" in m:
            items = "\n".join(
                f'    <details><summary>{name}, provenance prompt</summary><p><code>{p}</code></p></details>'
                for name, p in m["prompts"])
            prompts = PROMPT_SECTION.format(prompt_items=items)
        html = PAGE.format(slug=f"{base}/{slug}", label=m.get("h1", slug), title=m["title"], desc=m["desc"],
                           h1=m["h1"], lede=m["lede"], cards=cards, faqs=faqs, nav=nav_html(""), prompts="") 
        html = html.replace('<main class="pageMain">', '<main class="pageMain">' + prompts) if prompts else html
        # Facet pages are one directory deeper than category pages.
        html = html.replace('../../', '../../../').replace('href="../"', 'href="../../"')
        for category in NAV:
            html = html.replace(f'href="../{category}/"', f'href="../../{category}/"')
        out = os.path.join(ROOT, base, slug)
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, "index.html"), "w") as f:
            f.write(html)
        print("wrote", base + "/" + slug)

print("done")
