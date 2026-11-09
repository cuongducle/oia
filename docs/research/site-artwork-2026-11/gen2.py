#!/usr/bin/env python3
"""Round 2, the anti-boring prompt sheet (owner: "Nhìn chán điên", 2026-11-08).

Diagnosis from the excitement QC: 10/14 frames were motionless still lifes in
one warm-beige palette ("SAMEY STILLNESS"). Round 2 keeps the text-zone
contracts (the app layers still land on calm columns) but rebuilds every
subject with motion, color variety and drama. Kept from round 1: flashsale
(8/10), holiday (7), ed-holiday2 (6, correctly moody), laborday (9).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import run_codex, cover_crop, STAGE, NOTEXT

R2 = [
  ("matcha", (900,1200), "vertical 3:4",
   "Vibrant matcha action shot: a bamboo whisk vigorously stirring vivid emerald matcha in a dark ceramic bowl, green powder bursting into the air in a soft cloud, droplets mid-motion, dramatic single spotlight on black slate, deep shadows, rich saturated emerald against near-black, energetic premium tea campaign, like a frozen frame of motion.",
   " The LEFT third of the frame stays deep shadow (text sits there); all the action happens center-right."),
  ("botanical", (900,1200), "vertical 3:4",
   "Lush botanical skincare scene with jungle energy: amber glass bottles nestled among oversized tropical leaves with dew drops, dramatic dappled sunlight rays cutting through, rich saturated jungle green with terracotta accents, one leaf shadow moving across the products, vivid botanical print mood, not a quiet shelf.",
   " The TOP area stays calm leaf texture (text sits there); the lush cluster fills the lower right."),
  ("serum", (1024,1536), "vertical 2:3",
   "Luxury serum launch with water drama: an amber glass serum bottle on wet black stone as a wave of crystal-clear water splashes around its base, droplets frozen mid-air catching teal-gold light, rich teal and amber palette, high-end spa campaign energy with real motion.",
   " The TOP strip and BOTTOM strip stay dark and calm (headline + CTA text); the bottle and splash sit in the middle band, slightly right of center."),
  ("ed-product2", (1254,1254), "square 1:1",
   "Editorial skincare launch with warmth and drama: an amber dropper bottle releasing one golden serum drop, backlit by rich honey-colored light with a warm amber glow rim, deep terracotta shadows, the drop catching light mid-fall, luxurious warm campaign, saturated amber against deep umber.",
   " The LEFT half stays deep warm shadow (text sits there); the bottle and glowing drop sit right of center."),
  ("ed-poster2", (1122,1402), "vertical 4:5",
   "Pottery atelier in golden-hour drama: a potter's hands shaping wet clay on a spinning wheel, clay water droplets flying, warm golden dust in the air backlit by low sun through a workshop window, rich terracotta and amber tones, artisan craft magazine energy with real motion.",
   " The RIGHT half falls into deep warm shadow (text sits there); the wheel and hands sit left of center."),
  ("sneaker", (1024,1536), "vertical 2:3",
   "Sneaker drop with explosive energy: a cream-and-sage runner shoe launching off the ground mid-air with a burst of dust and small debris around it, dramatic rim lighting, deep charcoal near-black backdrop, the shoe lit like a hero with saturated pop, hype campaign energy, frozen motion.",
   " The TOP strip and BOTTOM strip stay pure empty dark backdrop (text sits there); the shoe and its dust burst sit alone in the middle band."),
  ("menuboard", (1024,1536), "vertical 2:3",
   "Bakery morning with steam and sparkle: fresh golden croissants on a rustic board with visible warm steam rising, flour dust sparkling in dramatic morning light beams, a flat white with latte art, honey-gold palette with real depth and atmosphere, appetizing artisan bakery campaign.",
   " The RIGHT third stays calm warm shadow (menu text sits there); the pastries and steam fill the left two-thirds."),
  ("festival", (900,1200), "vertical 3:4",
   "Electric night festival poster background: a crowd silhouetted with raised hands against blazing magenta and cyan laser beams cutting through haze, confetti in the air, deep indigo night sky, saturated neon color clash, high-energy concert campaign.",
   " The TOP strip and LEFT half stay darker haze/night sky (text sits there); the lasers and crowd energy concentrate on the right."),
  ("perspective", (900,1200), "vertical 3:4",
   "Premium consulting-deck background: deep indigo-to-violet gradient with elegant translucent 3D glass shapes floating in soft depth, subtle golden edge highlights on the glass, sophisticated tech-consulting aesthetic with quiet luxury, calm but rich, never flat.",
   " Keep overall contrast gentle enough that dark presentation text reads everywhere."),
]

POSTER = ("price20", (1024,1024), "square 1:1",
  "Glossy 3D typography milk-tea flash-sale banner with motion: a glass of iced milk tea with cascading boba pearls, ice cubes and a splash of tea frozen mid-air around the glass, warm caramel studio backdrop with dramatic light. Big glossy inflated 3D letters read exactly \"20% OFF TODAY\", render the text exactly, sharp and readable, centered above the glass. Rich caramel-amber palette, energetic premium sale mood. Keep all text at least 10% clear of every edge.")

EDIT = ("price30",
  "Edit image 1: change the big glossy 3D text so it reads exactly \"30% OFF TODAY\" instead of \"20% OFF TODAY\". Keep everything else identical, same milk tea glass, same splash, same backdrop, same lighting, same typography style, same layout. Keep all text at least 10% clear of every edge.")

if __name__ == "__main__":
    for id, size, aspect, subject, zone in R2:
        print(f"[r2] {id} …", flush=True)
        raw = run_codex(f"$imagegen Create a {aspect} image. Subject: {subject}{zone}{NOTEXT}")
        cover_crop(raw, size, f"{STAGE}/{id}.png")
    id, size, aspect, subject = POSTER
    print(f"[r2] {id} …", flush=True)
    raw = run_codex(f"$imagegen Create a {aspect} image. {subject}")
    cover_crop(raw, size, f"{STAGE}/{id}.png")
    print("[r2] price30 (edit) …", flush=True)
    raw = run_codex(f"$imagegen {EDIT}", image=f"{STAGE}/price20.png")
    cover_crop(raw, (1024,1024), f"{STAGE}/price30.png")
    print("round 2 staged")
