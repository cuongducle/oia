---
name: pixforge-remove-background
description: >-
  Remove image background via a PixForge server, returning a transparent PNG URL.
  Use when the user says "remove background", "cut out the background", "./product.jpg".
---

# PixForge Remove Background

```bash
node scripts/remove_background.mjs ./photo.jpg [--base-url https://your-pixforge.example]
```

Output: `{ok:true, taskId, sessionId, progress, download}`. The output is always a transparent PNG.
