---
name: oia-remove-background
description: >-
  Remove image background via an Oia server, returning a transparent PNG URL.
  Use when the user says "remove background", "cut out the background", "./product.jpg".
---

# Oia Remove Background

```bash
node scripts/remove_background.mjs ./photo.jpg [--base-url https://your-oia.example]
```

Output: `{ok:true, taskId, sessionId, progress, download}`. The output is always a transparent PNG.
