# Ma trận coverage web → thay thế (reorg bước 5)

Ngày: 2026-11-06. Luật (từ plan bước 5, thay metric "số test không giảm"):
**mỗi hành vi 12 file test web đang cover phải có test thay thế ở tầng
service/desktop trước khi xóa web (bước 6). Ô trống = port.**

Ô trống tìm thấy và ĐÃ LẤP trong bước này: `renderer-libs.test.ts` (desktop) và
`provider-status.test.ts` (services). Hai hành vi được ghi nhận là **kết thúc có chủ
đích cùng web** (không port — không còn consumer): share link `p/[id]` (bỏ theo D2)
và sync skills-registry (registry là artifact của trang docs web; `packages/skills`
giữ theo D9, consumer thật của nó là loopback API đã có e2e riêng).

| File test web | Hành vi | Test thay thế | Trạng thái |
|---|---|---|---|
| api.test.ts | session tạo → `{code,0,data.sessionId}`; thiếu prompt → 400; SSE events + narrative + `</Content>` | services `chat-service.test.ts` (schema, events, `</Content>` trong happy path); ChatSessionStore tests (tasks `projects.test.ts`); envelope HTTP → desktop `loopback.test.ts` (9 e2e) + DESKTOP_SMOKE (events=9) | ✅ |
| artboard-size.test.ts | `sceneSize` ưu tiên artboard tên "clip", scene cũ không tên, dims sai → mặc định | **PORT MỚI** desktop `renderer-libs.test.ts` (studio-ui: artboard dims) | ✅ đã lấp |
| brandkit-api.test.ts | validate kit (guidance/logo/color limits); applyByDefault đúng 1 active; extract clamp; templates publish/list/tip | tasks `brandkits.test.ts` (BR-BK1..4, BR-EX1..2, default toggle), `templates.test.ts` (publish/list/tip); "brand tới chat" → desktop `brandkit-wiring.test.ts` | ✅ |
| chat-cancel.test.ts | pre-flight refuse attemptNumber=0; cancel → terminal cancelled; cancel id không biết = no-op; provider status expose capabilities + quota (mock isMock); không còn localStorage blob | services `chat-service.test.ts` (refusals, cancellation, external abort); **PORT MỚI** `provider-status.test.ts` (snapshot + isMock + quota); handoff localStorage → projects store + desktop `desktop.test.ts` mapAssetUrls round-trip | ✅ đã lấp (provider-status) |
| chat-remediation.test.ts | không base64 trên wire (A1); G3 một job metered; A5 retry dùng plan stash | services `chat-service.test.ts` happy path ("canvas assetized, no base64"), G3 + A5 describes | ✅ |
| editor-persistence.test.ts | save đầu giữ nguyên pages; create migrate base64 → asset refs, reload được | tasks `projects.test.ts` + `migrate.test.ts` (create/saveScene extract, reopen) + mới: per-file reopen test (bước 5) | ✅ |
| english-ui.test.ts | lang en; không chữ Việt trong UI copy mọi màn | **PORT MỚI** desktop `renderer-libs.test.ts` (scan renderer không dấu Việt; EN dict sạch) — kèm phát hiện + sửa nốt giá trị Việt sót trong `i18n.ts` (D8) | ✅ đã lấp |
| integration.e2e-flows.test.ts | FLOW1 chat→persist→replay→project; FLOW2 API key guard; FLOW3 brand kit active; FLOW4 upload chunked→task→bytes; FLOW5 templates | FLOW1 → DESKTOP_SMOKE qua utility thật + tasks store durability tests; FLOW2 → `loopback.test.ts` (401/403 gates); FLOW3 → `brandkit-wiring.test.ts`; FLOW4 → `loopback.test.ts` (multipart upload + poll) + tasks `upload.test.ts`/`store.test.ts`; FLOW5 → `templates.test.ts`. **Share link: bỏ theo D2** (desktop = export file) | ✅ (share link ghi nhận kết thúc) |
| language-preferences.test.ts | default en; map vi→en; reject vi; persist en | Route `/api/settings` là web-only, xóa cùng web. Hành vi "UI tiếng Anh" → D8 + `renderer-libs.test.ts` (EN dict hoàn chỉnh) + `desktop.test.ts` runtimeViewModel (English copy) | ✅ (route kết thúc có chủ đích) |
| registry.test.ts | 4 categories; tool đại diện; slug unique; 13/14 implemented (ppt-translator landing); i18n key set khớp; skills-registry sync SKILL.md | Tools+i18n: **PORT MỚI** `renderer-libs.test.ts` (categories/slugs/landing duy nhất; EN dict). Skills sync: registry là artifact của trang docs web — kết thúc cùng web; `packages/skills` còn sống theo D9 và được e2e loopback dùng thử | ✅ đã lấp (skills sync ghi nhận kết thúc) |
| studio-ui.test.ts | fitArtboard vừa khung, landscape thật; template ≥4, filter theo category thật, imageSource an toàn | **PORT MỚI** `renderer-libs.test.ts` (canvas geometry + curated fallback + category + imageSource) | ✅ đã lấp |
| tasks-api.test.ts | submit noWait true/false; params sai → 400; unknown → 404; sessionId chaining; upload 3 bước + dedupe md5 | tasks `store.test.ts` (noWait, TTL 404, sessionId, schema 400), `upload.test.ts` (chunked + dedupe), desktop `loopback.test.ts` (poll 404 envelope), `guarded-task-submit.test.ts` (G3 lane IPC) | ✅ |

## Phát hiện kèm theo khi dựng ma trận (đã sửa trong bước 5)

1. **`i18n.ts` còn giá trị tiếng Việt trong dict "en"** (di sản Stage 0 "plain-Vietnamese",
   bị D8 ghi đè nhưng bước 4e chỉ trim key, không dịch giá trị): 26 chuỗi (mode.toggle,
   provider.mockBanner, editor.stop, toàn bộ error.*) vẫn là câu tiếng Việt. Không view
   nào gọi `t()` nên chưa bao giờ render — nhưng file tự mâu thuẫn với D8. Đã dịch toàn
   bộ sang tiếng Anh (giữ nguyên key → không đổi wire), export `EN_MESSAGES` làm nguồn
   gate, comment trỏ đúng D8.
2. **EN dict của `errors.ts` là `Partial`** — key thiếu sẽ silently fallback về
   "unknown". Gate mới: mọi class trong taxonomy phải render đúng bản EN của key
   riêng nó (không fallback).
3. **`providerStatusSnapshot` chưa từng có test trực tiếp** dù runtime panel render
   nó mỗi lần mở — đã thêm `provider-status.test.ts`.

## Số kiểm chứng

- packages/tasks: 99 test xanh (90 cũ + 9 mới import/per-file/migration chain).
- apps/desktop: 80 test xanh (63 cũ + 17 mới renderer-libs).
- packages/services: 19 test xanh (17 cũ + 2 mới provider-status).
- Toàn repo: `pnpm build && pnpm test && pnpm typecheck` xanh; DESKTOP_SMOKE OK
  events=9 (mock pair, Electron thật, qua utility process thật).
