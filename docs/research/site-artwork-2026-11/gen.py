#!/usr/bin/env python3
"""IM-site-art 2026-11-08 — regenerate every AI artwork on the landing site + README.

Owner: "ảnh trong landing page, ảnh trong readme đang rất xấu… ảnh cũ thời model
cũ chưa có prompt. Tôi cần thay toàn bộ."

Stages (run with the stage argument):
  gen    — run each prompt through the BUNDLED codex binary ($imagegen), stage the
           raw PNG into staging/<id>.png, then cover-crop to the exact target size
  qa     — print the contact sheet path for vision QA (nothing installs without this)
  install — copy staged webp over site/assets + app public/studio, rebuild derived
           assets (price-repaint pair composite), leaving README banner/og-hero to
           their own scripts

Quota: 16 images + planner tokens (owner-approved 2026-11-08).
Provenance: the prompt sheet below IS the record (SC-4 doctrine).
"""
import subprocess, sys, os, time, json, re, shutil
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
STAGE = os.path.join(REPO, "docs/research/site-artwork-2026-11/staging")
BIN = os.path.join(REPO, "apps/desktop/resources/codex/current/bin/codex")
NOTEXT = " Absolutely no text, no lettering, no numbers, no words, no captions, no logos, no watermarks anywhere in the image — copy is added later as separate editable layers."

# (id, target WxH, aspect words, subject prompt, zone clause)
PLATES = [
  ("matcha", (900,1200), "vertical 3:4",
   "Premium matcha tea editorial still life: a handmade ceramic bowl of whisked matcha with fine steam, bamboo whisk resting beside it, on dark moss-green stone, moody low-key lighting with one warm window light from the right, deep shadows, quiet luxury tea-brand mood, rich texture.",
   " Keep the LEFT third and the TOP of the frame dark, calm and empty (reserved for text); all visual interest sits in the right half and lower right."),
  ("festival", (900,1200), "vertical 3:4",
   "Bold festival poster background: dramatic low-angle view of brutalist concrete architecture with strong geometric shadows against a saturated deep-blue evening sky, sandstone and cobalt palette, crisp high-contrast editorial print mood.",
   " Keep the top strip and the LEFT half calm (sky or flat concrete — reserved for text); the dynamic forms live on the right."),
  ("botanical", (900,1200), "vertical 3:4",
   "Natural skincare editorial still life: amber glass dropper bottle and cream jar on warm travertine stone, soft eucalyptus leaf shadows falling across the scene, terracotta and cream palette, gentle late-afternoon light, premium botanical brand mood.",
   " Keep the TOP area and the LEFT half quiet and uncluttered (reserved for text); the product cluster sits right of center."),
  ("flashsale", (1024,1536), "vertical 2:3",
   "Café scene, premium espresso moment: polished chrome espresso machine pulling a rich shot into a small cup, swirling steam, scattered dark-roast beans on a dark walnut counter, dramatic side lighting, deep browns and brass, high-end coffee-house mood.",
   " Keep the ENTIRE RIGHT third of the frame dark, simple and uncluttered (reserved for text); all visual interest on the left half."),
  ("menuboard", (1024,1536), "vertical 2:3",
   "Artisan bakery scene for a menu board: rustic wooden board with fresh croissants, cardamom buns and a flat white on ceramic, warm flour dust in soft morning light, honey and cream palette, appetizing premium bakery mood.",
   " Keep the ENTIRE RIGHT third calm and simple (reserved for the menu list); the pastries arrange on the left two-thirds."),
  ("serum", (1024,1536), "vertical 2:3",
   "Luxury serum launch still life: one amber glass serum bottle standing on a smooth stone plinth, soft gradient studio background in warm sand tones, a single leaf shadow, minimal elegant beauty photography, generous negative space.",
   " Keep the TOP strip and the BOTTOM strip calm and empty (reserved for headline and CTA text); the bottle stands in the middle band, slightly right of center."),
  ("sneaker", (1024,1536), "vertical 2:3",
   "Hype product drop photo: one cream-and-sage runner sneaker floating dynamically at a slight angle, studio lighting with a soft spotlight, seamless warm-grey backdrop, subtle motion energy, premium streetwear campaign mood.",
   " Keep the TOP strip and the BOTTOM strip clear (reserved for product name and drop date); the shoe floats in the middle band, slightly right of center."),
  ("holiday", (1024,1536), "vertical 2:3",
   "Year-end gift campaign still life: premium gift boxes with gold ribbon on deep emerald velvet, warm bokeh fairy lights behind, rich green and gold palette, luxurious festive mood.",
   " Keep the TOP-LEFT half of the frame dark and calm (reserved for text); the gift cluster sits lower right."),
  ("perspective", (900,1200), "vertical 3:4",
   "Minimal abstract presentation background: soft overlapping translucent shapes in lavender, ink and paper tones on an off-white canvas, subtle grain, calm sophisticated consulting-deck aesthetic.",
   " Keep the overall composition very calm and low-contrast so presentation text stays readable everywhere."),
  ("ed-product2", (1254,1254), "square 1:1",
   "Editorial skincare launch photo: amber dropper bottle on travertine with a soft leaf shadow, warm beige palette, gentle morning light, refined minimal beauty-brand mood.",
   " Keep the LEFT half soft, calm and empty (reserved for text); the bottle sits right of center."),
  ("ed-poster2", (1122,1402), "vertical 4:5",
   "Craft pottery atelier scene: terracotta vases drying on a wooden shelf in warm golden afternoon light, dusty sunbeams, artisan magazine photography mood.",
   " Keep the RIGHT half calm and uncluttered (reserved for text); the pottery arranges on the left."),
  ("ed-holiday2", (1122,1402), "vertical 4:5",
   "Midnight-dark holiday gift scene: one premium gift box wrapped in deep charcoal paper with a thin gold ribbon, single warm candle glow, near-black elegant background, quiet luxury mood.",
   " Keep the LEFT half of the frame near-black and empty (reserved for text); the gift sits on the right."),
]

POSTERS = [
  # baked-text renders — exact copy, rendered INTO the artwork (poster mode)
  ("price20", (1024,1024), "square 1:1",
   "Glossy 3D typography milk-tea flash-sale banner: a glass of iced milk tea with boba on a warm cream studio backdrop. Big glossy 3D letters read exactly \"20% OFF TODAY\" — render the text exactly, sharp and readable, centered above the glass. Warm caramel palette, premium sale campaign mood. Keep all text at least 10% clear of every edge."),
]

EDITS = [
  # (id, source staging id, instruction) — keeps the style, changes the copy
  ("price30", "price20",
   "Edit image 1: change the big glossy 3D text so it reads exactly \"30% OFF TODAY\" instead of \"20% OFF TODAY\". Keep everything else identical — same glass of milk tea, same backdrop, same lighting, same typography style, same layout. Keep all text at least 10% clear of every edge."),
]

def run_codex(prompt: str, image: str | None = None) -> str:
    args = [BIN, "exec", "--skip-git-reck-check" if False else "--skip-git-repo-check", "--json", "--sandbox", "read-only", "-C", "/tmp", "-o", "/tmp/last.txt"]
    if image: args += ["-i", image]
    before = set(os.listdir(os.path.expanduser("~/.codex/generated_images")))
    p = subprocess.run(args, input=prompt.encode(), capture_output=True, timeout=420)
    out = p.stdout.decode(errors="replace")
    sid = None
    m = re.search(r'thread\.started[^}]*"id":"([0-9a-f-]{36})"', out)
    if m: sid = m.group(1)
    else:
        new = [d for d in set(os.listdir(os.path.expanduser("~/.codex/generated_images"))) - before]
        new.sort(key=lambda d: os.path.getmtime(os.path.expanduser(f"~/.codex/generated_images/{d}")))
        if new: sid = new[-1]
    if not sid: raise RuntimeError(f"no session id; stderr={p.stderr.decode()[:300]} out={out[:300]}")
    sd = os.path.expanduser(f"~/.codex/generated_images/{sid}")
    pngs = sorted(f for f in os.listdir(sd) if f.endswith(".png"))
    if not pngs: raise RuntimeError(f"no png in session {sid}")
    return os.path.join(sd, pngs[-1])

def cover_crop(src: str, size: tuple[int,int], dst: str):
    im = Image.open(src).convert("RGB")
    tw, th = size
    r = max(tw / im.width, th / im.height)
    im2 = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im2.width - tw) // 2; y = (im2.height - th) // 2
    im2.crop((x, y, x + tw, y + th)).save(dst, "PNG")

def stage_gen():
    os.makedirs(STAGE, exist_ok=True)
    manifest = []
    for id, size, aspect, subject, zone in PLATES:
        prompt = f"$imagegen Create a {aspect} image. Subject: {subject}{zone}{NOTEXT}"
        print(f"[gen] {id} …", flush=True)
        raw = run_codex(prompt)
        cover_crop(raw, size, f"{STAGE}/{id}.png")
        manifest.append({"id": id, "prompt": prompt}); time.sleep(2)
    for id, size, aspect, subject in POSTERS:
        prompt = f"$imagegen Create a {aspect} image. {subject}"
        print(f"[gen] {id} …", flush=True)
        raw = run_codex(prompt)
        cover_crop(raw, size, f"{STAGE}/{id}.png")
        manifest.append({"id": id, "prompt": prompt}); time.sleep(2)
    for id, src, instruction in EDITS:
        prompt = f"$imagegen {instruction}"
        print(f"[gen] {id} (edit of {src}) …", flush=True)
        raw = run_codex(prompt, image=f"{STAGE}/{src}.png")
        cover_crop(raw, dict(POSTERS)[src.replace('30','20')][0] if src in dict((p[0], (p[1],)) for p in POSTERS) else dict(POSTERS)["price20"][0], f"{STAGE}/{id}.png")
        manifest.append({"id": id, "prompt": prompt, "edit_of": src}); time.sleep(2)
    json.dump(manifest, open(f"{STAGE}/manifest.json", "w"), indent=1)
    print("staged:", len(manifest))

if __name__ == "__main__":
    {"gen": stage_gen}[sys.argv[1]]()
