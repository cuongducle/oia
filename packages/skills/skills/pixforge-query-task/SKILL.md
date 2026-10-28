---
name: pixforge-query-task
description: >-
  Check the status of an async PixForge task by taskId. Use when the user asks 'check task …'.
---

# PixForge query-task

```bash
node scripts/task.mjs --help-see-usage-below
```

Always keep the prompt in the user's language. Output JSON: `{ok, taskId, sessionId, progress, download}`.
