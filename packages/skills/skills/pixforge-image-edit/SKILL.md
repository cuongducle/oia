---
name: pixforge-image-edit
description: >-
  Edit an image (inpainting-style) via a PixForge server: pass reference image URLs + prompt,
  returns a PNG download URL. Use when the user says "edit this image", "make the awning blue",
  "edit this image". Always keep the user's language for --prompt.
---

# PixForge Image Edit

```bash
node scripts/image_edit.mjs --prompt "make the awning blue" --reference https://.../photo.png \
  [--base-url https://your-pixforge.example] [--session-id 123] [--async]
```

Output JSON: `{ok:true, taskId, sessionId, progress, download}`. Only the described region should change.
