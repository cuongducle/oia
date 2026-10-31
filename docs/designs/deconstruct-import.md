# B1 — Deconstruct import: hồi sinh banner cũ thành bản chỉnh sửa được

**Ngày:** 2026-10-31
**Trạng thái:** ĐÃ IMPLEMENT (mock pair đầy đủ, 2026-10-31 — gates xanh, xem cuối doc). Còn MỘT gate treo: **spike thật 1 lần trên máy owner** (nghi thức D12 — chạm quota phải duyệt) xác nhận planner model đọc ảnh qua `-i` + trả bbox dùng được.
**Nguồn quyết định cha:** [`feature-upgrade-brainstorm.md`](feature-upgrade-brainstorm.md) mục B1 + Q4. Doc này là bản "tốt nghiệp" theo Q5 — chi tiết B1 sống ở ĐÂY từ nay.
**Ràng buộc cha:** G2/G3 (không burn quota khi doomed; metered-once), B7, D8, TP.11 (no-silent-fallback), hard rule 6 (quota là tiền).

## Quyết định ghi đè (owner, 2026-10-31, sau teardown C3)

Q4 gốc (2026-10-31): AI-first + lane "Đọc thô 0 phí" tesseract + tesseract làm bbox dự phòng.
**Owner ghi đè: "làm giống họ thôi không cần làm khác" — BỎ cả hai phần tesseract.** B1 = đúng approach đối thủ tham chiếu: vision model đọc chữ (nội dung + vị trí, 1 lượt) → inpaint làm sạch vùng chữ (1 ảnh) → text layers đặt trên nền sạch. Khác biệt duy nhất giữ lại từ Q4 gốc: **hiện giá trước khi chạy** (đối thủ tự trừ credit; Oia đốt quota ChatGPT vô hình của seller nên phải nói trước). Tool OCR tesseract sẵn có ở Tools GIỮ NGUYÊN như tool rời — không dây vào B1.

Spike vị trí vì thế thu hẹp còn một câu: **model trả bbox dùng được không?** — trả lời bằng MỘT lần chạy thật trên máy owner (nghi thức D12: chạm quota phải owner duyệt). Không còn phương án B.

## Vấn đề

Seller có sẵn banner làm bằng Canva/ChatGPT (ảnh phẳng, chữ cháy trong ảnh). Sửa một chữ = regenerate hoặc làm lại từ đầu. Đối thủ giải bằng vision đọc + inpaint phía server (trừ credit). Oia cần cùng luồng đó, trung thực về giới hạn: **chỉ trích chữ + làm sạch — phần còn lại vẫn là ảnh phẳng** (không hứa tách object như quảng cáo "Smart Layer Separation" của họ — P5 đã đồng thuận là marketing hơn thực tế).

## Goals

1. Workspace: nút **"New from old design"** — chọn file ảnh cũ → dialog xác nhận hiện thumbnail + giá **"≈ 1 image + 1 read"** (ẩn khi mock) → chạy → mở Editor với: nền sạch (inpaint) làm artwork layer + **mỗi khối chữ một Textbox native** đặt đúng vị trí — sửa chữ 0 phí từ đó.
2. Hai pha trong MỘT task "deconstruct": (1) LLM vision đọc `{text, box}` (1 lượt) → (2) image inpaint xóa chữ giữ mọi thứ khác (1 ảnh). Cancel thường trực (signal xuyên suốt); mỗi pha metered đúng phễu riêng (meterLlm / meterImage).
3. Đọc sai/hỏng ở pha 1 → fail TRƯỚC khi đốt ảnh (G2): inpaint chỉ chạy sau khi read parse xong.
4. Agent dùng được qua loopback như mọi task (submit schema mới, envelope không đổi).

## Non-Goals

- Tách object / layer separation kiểu marketing — KHÔNG (trung thực).
- Lane free tesseract / bbox dự phòng — BỎ theo chốt ghi đè.
- Deconstruct từ Editor AI dock / variant tray (v1 một entry ở Workspace; dock nếu D10 đòi).
- Duyệt/sửa text TRƯỚC khi áp (text layers sinh ra là để sửa miễn phí trong editor — đó chính là điểm sản phẩm).
- Đổi fontSize/thêm font per-textbox thông minh (font size ước lượng từ box; seller tinh chỉnh trong editor).

## CUJ

1. Seller làm banner sale bằng ChatGPT web, ảnh đẹp nhưng giá in sai. Mở Oia → Workspace → "New from old design" → chọn file.
2. Dialog: thumbnail + tên file + "≈ 1 image + 1 read" + nút Cancel / **Deconstruct**. Bấm Deconstruct.
3. Progress chạy (2 pha). Xong → Editor mở: artboard đúng khổ ảnh gốc, nền là bản ĐÃ XÓA CHỮ, các khối chữ thành Textbox đúng chỗ. Seller sửa "299.000₫" → "199.000₫" một click, 0 phí, không regenerate.
4. Lỗi pha đọc (model trả JSON hỏng) → error rõ ràng, **0 ảnh bị đốt**. Cancel giữa chừng → dừng đúng chỗ (B7).

## Quyết định thiết kế (DC)

| # | Quyết định |
|---|---|
| DC-1 | **Entry duy nhất v1: nút "New from old design" ở Workspace** (cạnh "New from image"), kèm file input. Sau chọn file: Dialog xác nhận (component Dialog sẵn có) — thumbnail + giá + Cancel/Deconstruct. Xong: `createProject` + mở Editor. Mirror luồng import của đối thủ, không phát minh UI mới. |
| DC-2 | **Một task type `"deconstruct"`** đăng ký ở `createServiceContext` như mọi processor; đi qua `meteredGuard` chung (tools + loopback cùng lane — G3 như cũ). Params: `{fileUrl}` — file PHẢI đã upload (`uploadAsset` trước, như remove-background). |
| DC-3 | **Hai pha, thứ tự cứng:** read → parse → inpaint. Read dùng `LlmProvider.readImage?` (method MỚI optional) với JSON schema riêng `DECONSTRUCT_JSON_SCHEMA`; parse hỏng → `plan_parse_failed` (taxonomy sẵn) + inpaint KHÔNG chạy. Inpaint dùng `ctx.image.generate({referenceImages:[fileUrl]})` — kiểm `capabilities.referenceImages` cả hai pha (TP.11): provider thiếu năng lực → `capability_unsupported` rõ ràng, không mock lặng. |
| DC-4 | **`readImage` là method optional trên LlmProvider + capability flag `referenceImages`.** Codex impl: materialize bytes ra temp file ASCII-named (cùng pattern image/codex.ts) → `bridge.exec` role planner **+ `-i`** (bridge hiện chỉ gắn ảnh cho role image — mở cho planner) + `--output-schema` schema file riêng. Mock impl: prompt-aware deterministic (nhận marker trong DECONSTRUCT_READ_PROMPT → trả `{texts:[…]}` cố định). OpenAI LLM: chưa triển khai — capability false → lỗi rõ. |
| DC-5 | **Box là fraction chuẩn hóa 0..1** trong schema (`{x,y,w,h}` theo khổ ảnh) — map ở renderer sang px artboard. Artboard = đúng khổ ảnh gốc (đọc natural size từ `<img>` trong dialog — không thêm dependency). Chuẩn hóa giữ nguyên tính đúng vị trí kể cả khi provider trả ảnh khổ khác. |
| DC-6 | **Scene do renderer thuần dựng** (`deconstruct-scene.ts`): clip trắng khổ ảnh + artwork = ảnh sạch + Textbox mỗi text (fontSize ≈ boxH×0,75 clamp 12–200, width = boxW, fill #1f2937, Be Vietnam Pro, textAlign left). Không chạm @oia/canvas engine. |
| DC-7 | **Prompt là hằng số chung trong @oia/schema** (pattern `PLANNER_INSTRUCTIONS` của C1): `DECONSTRUCT_READ_PROMPT`, `DECONSTRUCT_INPAINT_PROMPT` — mock derive matcher từ chính hằng số, reword một chỗ tự đồng bộ. |
| DC-8 | **Kết quả task mang texts:** `TaskHandlerResult` += `texts?: DeconstructText[]` (additive); `TaskStatus.taskResult` += `texts` (additive — envelope HTTP/IPC, store in-memory TTL). UI Workspace đọc texts từ poll result để dựng scene. |

## Thiết kế kỹ thuật

- **@oia/schema:** `deconstructTextSchema {text, box:{x,y,w,h}}` (fraction 0..1, strict); `deconstructReadSchema {texts: [.max(60)]}`; `DECONSTRUCT_JSON_SCHEMA` (bản JSON-Schema cho `--output-schema`); 2 prompt hằng số; `taskTypeSchema` += `"deconstruct"`; `submitTaskSchemas["deconstruct"] = {fileUrl}`.
- **providers/types.ts:** `LlmChatOpts` giữ nguyên; `LlmProvider` += `readImage?(prompt, image: Uint8Array, schema: object, opts): Promise<string>`.
- **providers/codex/bridge.ts:** role planner cũng gắn `opts.images` qua `-i` (mở ràng buộc hiện tại) — ảnh là input của prompt, read-only sandbox vẫn chặn ghi.
- **providers/llm/codex.ts:** `readImage` impl + `capabilities.referenceImages = true`.
- **providers/llm/mock.ts:** `readImage` deterministic theo marker trong prompt.
- **tasks/processors.ts:** `makeDeconstruct(ctx)` — đọc store bytes → readImage → parse strict → image.generate (dims = ảnh gốc, truyền width/height) → put PNG → `{urls:[cleanUrl], texts}`.
- **services/context.ts:** đăng ký `"deconstruct"`.
- **renderer/lib/deconstruct-scene.ts (thuần + test):** `deconstructScene({imageUrl, w, h, texts}) → SceneCanvas`.
- **Workspace.tsx:** nút + Dialog xác nhận (price label theo `imageMock` — pattern cost-hint A1/C1) → uploadAsset → submitTask poll → dựng scene → createProject → onOpenProject.
- **shot (exit 20):** fixture PNG → DataTransfer vào input → dialog hiện (price ẩn mock) → Deconstruct → poll xong → editor mở → scene có ≥1 Textbox đúng nội dung mock + artwork layer + không error.

## TP / luật bị chạm

- **G2:** pha ảnh chỉ chạy sau khi pha đọc parse xong — parse hỏng = 0 ảnh đốt (test pin).
- **G3:** task đi meteredGuard chung; 2 pha meter ở 2 phễu đúng loại (read = LLM, inpaint = image).
- **B7:** cancel giữ hành vi sẵn có của task lane (cancelled outcome, kết quả trọn vẹn giữ).
- **TP.11:** capability check cả 2 pha — không silent fallback xuống mock.
- **D8:** chuỗi UI mới EN. Nội dung text lấy từ ảnh của seller (content-level — tiếng Việt tự nhiên).

## Gates (đã chạy 2026-10-31, mock pair)

1. ✅ Schema 20 test (6 mới): fraction hợp lệ/trong khoảng/trim/rỗng hợp lệ/cap 60/JSON-Schema mirror + marker prompt.
2. ✅ Providers 87 test (4 mới): codex readImage (fake bin ghi `-o` — trả đúng JSON), bridge planner-role gắn `-i` + giữ read-only sandbox, mock marker-keyed deterministic, capability gate pin.
3. ✅ Tasks 111 test (6 mới): happy path (inpaint đúng khổ gốc + reference + texts truyền qua); **G2: parse hỏng → plan_parse_failed + image.generate 0 lần gọi** (probe); TP.11 cả 2 pha; fileUrl thiếu/sai lỗi rõ; non-PNG fallback vuông (fraction giữ vị trí).
4. ✅ Desktop: deconstruct-scene 3 test (map fraction→px, clamp font, 0-text hợp lệ) trong bộ xanh; shot **exit 20 ×3 liên tiếp**: fixture PNG → dialog (giá ẨN khi mock) → confirm → editor mở → đúng 3 Textbox (có "SALE 50") + artwork + `artScaled=[600,200]` + không error; vision-verify artifact (nền phủ kín, 3 dòng chữ, thumbnail nhất quán).
5. ✅ Repo build + test (16 task) + typecheck xanh.

## Phát hiện khi làm (3 — một bug thật, hai sửa cấu trúc)

1. **[BUG THẬT — fabric vẽ-sai-độ, vision bắt được] `_renderFill` vẽ ảnh tại `min(hộp, natural size)`** — object khai 600×200 trên element 8×8 (mock placeholder) vẽ một miếng 8×8 ở góc, trong khi `getScaledWidth()` báo 600 — mọi gate DOM/scene đều xanh, ảnh chụp mới lộ (trắng + ô tím nhỏ; lần 3 mắt thắng assert). Vật源头: normalizeImageScales — width/height trở về KÍCH THƯỚC ELEMENT, scale kéo paint về đúng hộp khai báo (lần sửa 1 chỉ set scale → bounding 45000 — sai hướng; hợp đồng hiển thị = hộp × scale hiện có). Chạy tại MỌI chỗ load (editor mount/page/undo/redo/export renderer + ScenePreview). **Sửa kèm bug tiềm ẩn cũ của "New from image"** (khai 1360×2048 cho ảnh bất kỳ). Idempotent; giữ nguyên semantics stretch của variant replace. Gate mới: `artScaled` pin trong shot + 4 test unit canvas (44 tổng).
2. **meterLlm nuốt readImage** — wrapper chỉ forward `chat`, task lane nhận provider không có method → capability_unsupported ngay lần chạy shot đầu. Sửa: forward readImage qua CÙNG phễu planner (hard rule 6 — lượt đọc là lượt LLM trả tiền, không có cửa miễn phí).
3. **Mock IMAGE provider khai `referenceImages: false` trong khi nó chấp nhận (và bỏ qua) mọi input** — nói sai về chính nó, chặn mọi gate mock-pair của B1. Flip true + comment lý do; không test nào ghim giá trị cũ.

Kèm 1 sửa kịch bản shot: fixture phải là PNG THẬT (đọc từ shotOcr) — blob rác làm preview Image onerror → dialog không bao giờ mở; và thêm settle-poll (scene load async — đọc canvas ngay khi editor mount bắt 0 object).

## Còn treo (đã biết, không "phát hiện lại")

- **SPIKE THẬT (gate 7 của doc):** chạy MỘT lần deconstruct với ảnh banner thật qua codex — xác nhận (a) planner model nhận ảnh qua `-i` trong exec mode, (b) JSON đúng schema, (c) bbox fraction đặt Textbox đúng chỗ chữ. Chạm quota → chờ owner duyệt (nghi thức D12). Trước spike: mọi claim về chất lượng model là "chưa kiểm chứng" — mock chỉ chứng wiring.
- Nợ B1 sau spike: text layer fontSize ước lượng từ box (seller tự tinh chỉnh); không duyệt/sửa text trước khi áp (chủ đích — Non-Goal); dialog không hiện progress theo pha (task lane chỉ có processing/succeeded/failed).

## Rủi ro / cạnh đã nghĩ

- **Model không trả bbox tốt** (spike bại): fallback không có (đã bỏ tesseract theo chốt) → phương án khi đó là quay lại owner chốt lại, không tự thêm lane. Doc ghi rõ để không "phát hiện lại".
- **`-i` + planner model không hỗ trợ ảnh** (spike bại khả năng 2): lỗi rõ từ codex → hiển thị như lỗi provider, không treo. Cùng quay owner.
- **Inpaint không sạch chữ / làm hỏng nền:** đây là giới hạn model — trung thực: artwork layer là ảnh sạch CÙNG khổ, seller thấy gì được đó; không hứa "perfect clean".
- **Vị trí lệch khi provider inpaint trả khổ khác ảnh gốc:** fraction giữ đúng tương đối; artwork layer stretched về đúng khổ artboard (cùng cơ chế A1 aspect warning — chấp nhận, ghi trong dialog? Không — im lặng stretch là OK vì artboard = khổ gốc và ta truyền width/height gốc cho provider).
- **Ảnh rất lớn:** upload limit 50 MB sẵn có; read prompt không mang bytes (chỉ đường dẫn file temp).
