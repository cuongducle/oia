---
name: oia-generate-poster
description: >-
  Generate an event/promo poster via an Oia server, returning a PNG download URL.
  Use when the user says "make a poster", "make a poster", "event poster". Always pass
  --language matching the user's language (en|vi|zh|ja).
---

# Oia Generate Poster

Submit a poster task to an Oia server and return the download URL.

## Language consistency

| User writes in | Pass `--language` | Write `--prompt` in |
|---|---|---|
| Vietnamese | `vi` | Vietnamese |
| English | `en` | English |
| 中文 | `zh` | Chinese |

Never translate the user's request into another language silently.

## Usage

```bash
node scripts/generate_poster.mjs --prompt "poster ca phe sua da giam 20%" \
  --style pastel --language vi [--base-url https://your-oia.example] [--async]
```

Output JSON: `{ok:true, taskId, sessionId, progress, download}` — save `sessionId` to iterate later.
