---
name: pixforge-image-translate
description: >-
  Translate text inside images while keeping the design, via a PixForge server.
  Use when the user says "translate this poster to English", "translate the text in this image".
---

# PixForge Image Translate

```bash
node scripts/image_translate.mjs --url https://.../poster.png --language en \
  [--base-url https://your-pixforge.example] [--async]
```

Output: PNG (or a ZIP for multiple images) download URL.
