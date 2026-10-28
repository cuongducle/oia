---
name: oia-image-translate
description: >-
  Translate text inside images while keeping the design, via an Oia server.
  Use when the user says "translate this poster to English", "translate the text in this image".
---

# Oia Image Translate

```bash
node scripts/image_translate.mjs --url https://.../poster.png --language en \
  [--base-url https://your-oia.example] [--async]
```

Output: PNG (or a ZIP for multiple images) download URL.
