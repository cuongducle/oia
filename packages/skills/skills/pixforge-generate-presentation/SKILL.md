---
name: pixforge-generate-presentation
description: >-
  Generate a PPTX deck from a topic or outline via a PixForge server, returning a download URL.
  Use when the user says "generate ppt", "make slides", "build a presentation". Always pass --language
  matching the user's language (en|vi|zh|ja).
---

# PixForge Generate Presentation

## Language consistency

| User writes in | Pass `--language` | Write `--prompt` in |
|---|---|---|
| Vietnamese | `vi` | Vietnamese |
| English | `en` | English |
| 中文 | `zh` | Chinese |

Never silently translate the user's request.

## Usage

```bash
node scripts/generate_presentation.mjs --prompt "Q3 marketing review" --n 8 --language vi \
  [--base-url https://your-pixforge.example] [--async]
```

Output: PPTX download URL + sessionId (reuse it to iterate on the same deck).
