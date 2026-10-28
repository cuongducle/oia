# PixForge

Open-source, self-hostable AI visual design studio. Describe what you want, let the agent compose it, then edit every layer yourself — posters, presentations, social posts, and more.

- **Agent chat → design**: streaming SSE agent (`Designer Agent → Image Generator → Manager Agent`) with a live task timeline and progressive canvas updates.
- **Layer-based editor**: Fabric.js canvas — every generated design stays fully editable (move, restyle, retype text), with multi-page projects, undo/redo, autosave, and sharing.
- **Export anywhere**: PNG, JPG, PDF (mixed page sizes), PPTX, ZIP.
- **BYOK generation**: bring your own provider keys — or use the Codex CLI with an existing ChatGPT login. A mock provider ships by default so everything runs keyless.
- **Toolbox**: quick tools (converters, resizer, charts, AI editor…) plus dedicated skills like the Xiaohongshu/RED carousel creator.
- **Brand kit**: logos, colors, fonts, and guidance applied to every generation.
- **For agents**: an HTTP API with API keys and installable `SKILL.md` agent skills (Claude Code, Codex, Cursor, Gemini CLI).

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3100 — mock provider, no keys needed
```

Optional Redis for the background worker:

```bash
docker compose -f docker/docker-compose.yml up -d redis
REDIS_URL=redis://localhost:6379 pnpm --filter @pixforge/worker dev
```

Tests (integration tests use Redis when available):

```bash
pnpm build && pnpm typecheck
REDIS_URL=redis://localhost:6379 pnpm test
```

## Providers (BYOK)

Copy `.env.example` to `.env` and fill in what you have. Leave everything blank to keep the offline mock provider.

| Variable | Options |
| --- | --- |
| `IMAGE_PROVIDER` | `mock` (default) · `codex` · `openai` · `fal` · `replicate` · `comfyui` |
| `LLM_PROVIDER` | `mock` (default) · `openai` · `openrouter` · `ollama` |

**Codex image generation without any API key**: run `codex login` once (Sign in with ChatGPT), set `IMAGE_PROVIDER=codex`. Generation uses your ChatGPT plan quota via the CLI's `$imagegen`.

## Self-host API

```bash
pnpm --filter @pixforge/web dev
# Create a key at http://localhost:3100/for-agents
curl -X POST localhost:3100/api/tasks/generate-poster \
  -H 'content-type: application/json' \
  -d '{"prompt":"pastel coffee poster","noWait":true}'
```

Set `PIXFORGE_REQUIRE_KEY=1` in production to require `authorization: pf-…` on resource endpoints. Responses use a `{code, data, msg}` envelope; tasks poll via `GET /api/tasks/{taskId}` (24h TTL). Chunked upload: `POST /api/upload/chunk-init → /chunk → /chunk-complete`.

Agent skills live in `packages/skills/skills/pixforge-*` — copy the ones you need into `~/.claude/skills/` (or your agent's skill directory) and set `PIXFORGE_BASE_URL` + `PIXFORGE_API_KEY`.

## Monorepo layout

```
apps/web            Next.js app — studio UI, editor, REST + SSE API
apps/worker         background task worker (BullMQ / in-process)
packages/schema     zod schemas: scene graph, SSE protocol, task types
packages/protocol   SSE decoder + [[task::]]/[[canvas::]] markers + golden fixture
packages/canvas     Fabric wrapper, editor presets, pages, export planner
packages/providers  BYOK adapters: image (mock/codex/openai/fal/…) · llm (mock/openai/…)
packages/agent      designer agent: planner → image tool → progressive canvas events
packages/tasks      task store, queue (BullMQ), processors, uploads, projects, templates
packages/db         drizzle schema (users/sessions/projects/brandkits/templates/api_keys)
packages/skills     SKILL.md agent skills
docker/             postgres + redis + minio compose files
docs/               design direction and verification notes
```

## Status

Honest availability: the editor, generation pipeline, exports, quick tools, brand kit, and agent API are implemented and tested (152 tests, including real Redis worker runs and an authenticated Codex image integration test). Background removal requires the `rembg` CLI. PPT Translator is a coming-soon landing page. Multilingual generation follows your prompt's language; the interface is English.

MIT licensed. See [LICENSE](LICENSE).
