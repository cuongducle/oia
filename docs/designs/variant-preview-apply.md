# A1 — Preview-before-apply: khay variant + Replace selected layer

**Ngày:** 2026-10-31
**Trạng thái:** ĐÃ IMPLEMENT trên nhánh `a1-preview-apply` (5 commit, gates xanh — xem cuối doc). Owner kích hoạt sớm — xem "Quyết định sequencing" dưới.
**Nguồn quyết định cha:** [`feature-upgrade-brainstorm.md`](feature-upgrade-brainstorm.md) mục A1 + Q1 (chốt 2026-10-31). Doc này là bản "tốt nghiệp" theo Q5 — mọi quyết định triển khai sống ở ĐÂY, brainstorm doc ngừng cập nhật chi tiết A1.
**Ràng buộc cha:** `design-direction.md` (UX rules, no-silent-fallback), hard rules AGENTS.md (B7 records-must-not-lie, quota-is-money G3, D8 English UI).

## Quyết định sequencing (owner)

Sequencing cũ: "v1.1 triển khai SAU gate D10 (validation seller thật)". **Owner ghi đè (2026-10-31): bắt đầu triển khai v1.1 luôn, không chờ D10.** D10 vẫn là gate phát hành như cũ (bước 7 reorg plan) — dữ liệu D10 giờ đến SAU khi A1 có mặt trong app, checkpoint "click xuyên outline card" của C1 được kiểm trên bản có tính năng thật thay vì giả định. Ghi tương tự vào `desktop-only-reorg.md` (hậu kỳ v1.1) và `SITEMAP.md`.

## Goals

1. Edit qua AI dock trong Editor **không đụng canvas** cho tới khi người dùng chọn áp dụng — kết quả về **khay variant trong dock** (thumbnail + mô tả + 3 hành động).
2. **Replace selected layer** (hành động chính, điểm khác biệt hóa): thay ĐÚNG layer artwork đang chọn bằng artwork của variant; mọi text layer / layer thủ công khác giữ nguyên vị trí.
3. **Open in editor**: mở project MỚI từ variant (mirror nút Home).
4. **Not now**: ẩn card khỏi dock; asset + bản ghi conversation KHÔNG bị xóa.
5. Variant persist gắn với **conversation** (chat session): canvas đã asset hóa qua `migrateRenderData` (G5) từ trước — bản ghi sống trong `chat-sessions.json`, xoá thật chỉ khi xoá conversation. Không auto-cleanup.
6. Pre-flight trung thực về chi phí: nhãn "≈ 1 image" cạnh nút gửi khi provider thật; không nhãn khi mock. Stop (Cancel) thường trực khi đang chạy — hành vi sẵn có, giữ.

## Non-Goals

- **"Generate 3"** (batch variant) — đã chốt ở gap P0 `design-product-ui-2026.md` nhưng thuộc composer Home, không thuộc slice này; làm doc riêng khi triển khai.
- **A3 selection-bound** (selection → @-mention tự suy): candidate riêng; slice này chỉ dùng selection ở thời điểm áp dụng (Replace), không đổi composer.
- Áp dụng variant text-block vào canvas (chỉ artwork src được áp — xem VA-4).
- Đổi luồng resume conversation (Home history vẫn về Home như cũ).
- Multi-page variant trong editor (editor không gửi `pages`; nếu engine trả nhiều canvas, mỗi canvas là một card — trung thực, không gộp).

## CUJ

1. Seller mở project trong Editor, chọn layer artwork (ảnh nền AI), gõ "đổi nền thành tone pastel" trong AI dock → gửi. Nhãn "≈ 1 image" hiện cạnh nút (provider thật). Canvas KHÔNG đổi trong lúc chạy.
2. Kết quả về: card variant mới xuất hiện trên khay (thumbnail + prompt rút gọn + 3 nút). Timeline/narrative vẫn chạy như cũ.
3. Seller bấm **Replace selected layer** → layer ảnh nền đổi src, mọi text/logo của seller giữ nguyên chỗ. Cmd+Z undo được. Card ở lại (có thể áp lại / mở ra làm project khác).
4. Hoặc bấm **Open in editor** → project mới từ variant, về sau dùng như project thường.
5. Hoặc bấm **Not now** → card biến mất khỏi dock; mở lại conversation vẫn thấy ảnh (bản ghi không mất).
6. Lỗi/cancel giữa chừng: không card, error banner như cũ; job feed Runs vẫn ghi (B7).

## Quyết định thiết kế (VA)

| # | Quyết định |
|---|---|
| VA-1 | **Variant là state renderer của conversation, bản ghi bền là chat session.** Không thêm store mới, không bump schema (D14). Editor dock giữ `sessionId`: lần edit đầu không có → `chatRun` trả về sessionId (field MỚI, additive trên wire IPC) → các lần sau gửi kèm (`chatRequestSchema` đã có sẵn field này — hôm nay editor bỏ trống nên MỖI edit sinh session rời; sau này một conversation editor = một session, và plan stash A5 của session được dùng lại đúng nghĩa). |
| VA-2 | **Mỗi canvas msgMeta = một variant card.** `id` = uuid (renderer), kèm `jobId`, `prompt`, `thumbnail` (asset URL từ assetizeEvent), `canvas` (canonical form). |
| VA-3 | **Canvas không bao giờ auto-mutate trong editor dock nữa.** Khối `mergeScenePreservingUserObjects → replaceCurrentScene` trong onChatEvent bị THAY bằng push variant. Đây là behavior change chủ đích (spec A1 bước 3: "canvas giữ nguyên tuyệt đối"). |
| VA-4 | **Replace = đổi `src` của ĐÚNG một object đang chọn, giữ toàn bộ geometry (left/top/scale/angle) và mọi object khác.** Variant text-block KHÔNG áp (spec: "mọi text layer/manual layer giữ nguyên vị trí" — đây chính là loop "sửa một chỗ, không mất phần đã ưng"). Điều kiện enable: object đang chọn có `src` (image layer). Không thỏa → nút disabled + hint "Select an image layer first". |
| VA-5 | **Chọn artwork từ variant:** trong scene variant, ứng viên = object không phải `clip`, không origin "user", có `src`. Chọn theo diện tích hiển thị lớn nhất (width×scaleX × height×scaleY từ JSON — deterministic, đúng cho cả collage); không có → nút Replace disabled với hint "This variant has no artwork image". |
| VA-6 | **`mergeScenePreservingUserObjects` bị XOÁ khỏi @oia/canvas** (cùng test) sau khi editor ngừng dùng — không còn consumer, code chết là vi phạm tinh thần D2; git history giữ. TP.10 (non-destruction) tiếp tục được đảm bảo bởi cơ chế mới: apply chỉ đụng src của MỘT object người dùng chỉ đích danh. |
| VA-7 | **Not now = ẩn in-memory** (Set theo variant id). Reload/reopen conversation hiện lại đủ variant — khớp bằng chứng đối thủ ("chat cũ mở lại vẫn còn ảnh"); không có state "đã ẩn" persisted (không phải dữ liệu, là view state). |
| VA-8 | **"New conversation" trong dock** reset session (sessionId về null → edit kế tạo session mới) + dọn khay variant + hidden set + timeline/narrative như cũ. |
| VA-9 | **Wire change duy nhất:** `chatRun` IPC trả `{ jobId, outcome, sessionId }`. Additive — preload passthrough không đổi, smoke/realSmoke destructure không vỡ. Không đổi `chatRequestSchema`, không đổi ChatEvent, không đụng loopback. |

## Thiết kế kỹ thuật

**@oia/canvas (`provenance.ts`)** — 2 hàm thuần mới:

```ts
variantArtworkObject(scene: SceneCanvas): { src: string } | null   // VA-5
replaceObjectSrc(scene: SceneCanvas, index: number, src: string): SceneCanvas  // VA-4 — copy-on-write, throw khi index sai
```

**services/chat.ts** — `runChat` return thêm `sessionId` (session đã có sẵn trong hàm; chỉ truyền ra).

**utility/index.ts** — chatRun passthrough `sessionId`.

**shared/bridge.ts** — type `chatRun` return thêm `sessionId: number`.

**Editor.tsx** — state mới: `aiSessionId`, `variants: VariantCard[]`, `hiddenVariants: Set<string>`, `imageMock` (từ providerStatus sẵn có). onChatEvent: canvas msgMeta → push card (VA-2), bỏ auto-merge (VA-3). `runAiEdit` gửi sessionId khi có, nhận về và ghim. Hành động Replace: `activeObject` → index trong `c.getObjects()` → `snapshotActive()` (canonical) → `replaceObjectSrc` → `replaceCurrentScene(mapAssetUrls(...))` (reuse đường load + undo stack sẵn có). Open in editor: `createProject({ name: "<project> — variant", scene })` qua prop mới `onOpenProject` (App đã có `openProject`, Editor nay nhận thêm prop này).

**app.css** — `.variantTray` / `.variantCard` / nút hành động; kiểu khớp dãy dock hiện nay, không glass/no native effect (luật v1).

## TP / luật bị chạm

- **TP.10 (non-destruction):** chuyển từ "merge giữ user objects" sang "apply chỉ đổi 1 src do người dùng chỉ định" — VA-4/VA-6. Bảo vệ ngang, cơ chế khác.
- **G3 (metered-once):** không đổi — mỗi variant vẫn là đúng một job chatRun như cũ; không retry mới.
- **B7 (records must not lie):** job feed Runs giữ nguyên; variant card là bản trình bày của canvas msgMeta — canvas thật persist trong session record, card không tự sao chép dữ liệu riêng (một nguồn, không lệch bản).
- **D8:** mọi chuỗi UI mới là tiếng Anh.

## Gates (đã chạy 2026-10-31, nhánh `a1-preview-apply`)

1. ✅ `packages/canvas/test/provenance.test.ts` — 38 test canvas xanh (gồm 9 mới: largest-area pick, legacy-default, copy-on-write giữ geometry/reference, RangeError/TypeError error paths).
2. ✅ `packages/services/test/chat-service.test.ts` — 21 test xanh (2 mới: join đúng session qua sessionId — 2 cặp tin trong 1 session, không sinh session mới; refusal vẫn trả sessionId vì prompt đã persist — B7).
3. ✅ **Shot (mock pair, exit 17 khi sai):** submit edit qua dock thật → **đúng 1 card** (dedupe — xem phát hiện dưới) → canvas srcs **byte-identical** khi kết quả về (pin chống auto-merge cũ sống lại) → Replace disabled khi chưa chọn → chọn artwork xong enabled → bấm Replace: apply path chạy (undo bật trên editor mới), object count giữ, ≤ 1 src đổi, không error → Not now ẩn card. Mock placeholder dedupe về cùng URL nên "đúng 1 src đổi" pin ở unit test (dữ liệu kiểm soát được) — shot pin wiring.
4. ✅ `pnpm build && pnpm test && pnpm typecheck` toàn repo xanh (8/16/15 task).

**Phát hiện nhờ gate:** designer stream phát LẠI cùng một canvas meta nhiều lần trong 1 job (designer.ts các yield canvasMeta) — code merge cũ che việc này (đè lên nhau vô hại); khay variant mà không dedupe sẽ hiện card ma. Đã dedupe theo `jobId:canvasId` (VA-2). Đây đúng họ bài học "gate element-tồn-tại không bắt được vẽ-sai" — gate ĐẾM card mới bắt được.

**Sự cố vận hành (ghi lại để cả nhà tránh):** một phiên agent khác làm glass/icon trong cùng repo chạy `git reset --hard` giữa chừng, xóa sạch working tree chưa commit của phiên này (05:40). Toàn bộ A1 được khôi phục lại từ ngữ cảnh và commit theo tầng + push nhánh `origin/a1-preview-apply` ngay sau đó. Bài học: KHÔNG để work-in-progress nằm ngoài commit trong repo đa-agent; commit sau mỗi tầng xong.

## Rủi ro / cạnh đã nghĩ

- **Identity object bằng index:** chỉ dùng trong một nhịp đồng bộ (đọc active object → tính scene mới → reload) — không giữ index lâu dài.
- **Variant khác tỉ lệ khổ:** Replace giữ geometry layer đích → ảnh mới co giãn vào đúng bounding box cũ (khớp ý "giữ nguyên vị trí"); không auto-refit — nếu cần fit là quyết định UX sau, có dữ liệu D10.
- **Thumbnail thiếu** (provider không trả): card render `ScenePreview` từ canvas — không có card trống.
- **Đ conversation của Home:** Home composer KHÔNG đổi trong slice này (kết quả Home vẫn là ResultCard như cũ).
