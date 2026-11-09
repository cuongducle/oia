# ME: Markup edit "khoanh để sửa": sửa ảnh bằng bút vẽ, không bằng câu chữ

**Ngày:** 2026-11-07 (tốt nghiệp từ [images-2.6-upgrade.md](images-2.6-upgrade.md) IM26-3, owner duyệt hướng trong đợt "Duyệt hết")
**Trạng thái:** **ME-1…ME-5 SHIP 2026-11-08 (flatten-mode, mock-verified)**: schema/capability/clauses + Editor annotate overlay + ask panel + shot gate với pixel-truth. Field-mode (wire OpenAI) hoãn theo lane BYO. Còn mở: 1 lần chạy thật qua UI (đã được chứng minh ở mức kênh bởi probe P3).
**Tác giả:** cuongducle + agent
**Liên quan:** [variant-preview-apply.md](variant-preview-apply.md) (khay preview, kết quả markup edit đi đúng khay này), [deconstruct-import.md](deconstruct-import.md) (B1 cùng endpoint /edits), [designer-agent-loop.md](designer-agent-loop.md) (capability gating mẫu của `--search`).

## Vì sao làm

"Replace **cái** chai, cái thứ ba từ trái" là câu prompt không ai viết đúng nổi; khoanh tròn cái chai thì ai cũng làm được. Images 2.6 mở markup-guided editing trên API (ảnh gốc + 1 layer PNG transparent chú thích ở field riêng, khoanh/mũi tên/chữ viết tay), hỗ trợ cả model 2.5. Đây là tính năng **đúng DNA "Layers, not magic"** của Oia: canvas đã là layer, annotation chỉ là một lớp view tạm sinh ra từ chính canvas.

## Dữ kiện API (đã verify IM26-0)

- Endpoint: `/v1/images/edits`; ảnh đầu tiên trong `images[]` là ảnh **được sửa**; ảnh thêm = reference; layer chú thích đi field **riêng** (`markup`), KHÔNG flatten vào ảnh.
- Ràng buộc cứng: layer markup **cùng kích thước pixel đúng** ảnh gốc; mỗi ảnh ≤ 16.777.216 px; file markup ≤ 50 MB; không kết hợp mask hay prompt rewriter.
- Provider hỗ trợ: OpenAI wire (BYO key). **Codex `$imagegen` chưa có markup field** → lane plan KHÔNG mở tính năng này (capability gate), đến khi codex CLI hỗ trợ.

### Cập nhật sau probe thật (2026-11-08, [bằng chứng](../research/im26-probes/README.md))

Probe P3 trên pin 0.167.0 đã **đập giả định "lane codex không làm được"**: gửi ảnh có ellipse đỏ FLATTEN vào + chỉ dẫn chữ ("vòng đỏ là annotation, xoá nó, đổi giá trong vòng") → model hiểu vùng cần sửa, **tự dọn sạch marker**, đổi đúng nội dung, giữ nguyên phần còn lại (lỗi duy nhất: glyph ₫ hơi dị, loại lỗi critic đã bắt được). Kết luận thiết kế:

- **Hai biến thể, một UI**: codex lane = **flatten-mode** (annotation composite vào ảnh trước khi gửi, rẻ, dùng được NGAY, không cần key); OpenAI lane = **field-mode** (markup tách lớp khi lane BYO quay lại, chính xác hơn vì model nhận chỉ dẫn ở kênh riêng). Provider capability tách làm 2 cờ: `markupEdit: "flatten" | "field" | undefined`.
- Cost label hai lane như nhau: "≈ 1 image edit".
- Điểm cần gate riêng cho flatten-mode: prompt phải khai báo tường minh "marker là annotation, xoá sạch" (đã chứng minh hiệu quả) + critic chạy như thường (bắt lỗi glyph như P3).

## Thiết kế

### Luồng người dùng

1. Editor → chọn layer ảnh → ContextToolbar có nút **"Circle to edit"** (bên cạnh "Make text editable" D16).
2. Vào chế độ annotate: con trỏ thành bút; vẽ tự do (mặc định **đỏ**, nét dày ~1,5% cạnh ngắn, đỏ là màu markup mà modeldocs dùng làm ví dụ; không cho đổi màu v1). Vẽ trên **overlay view-layer**, KHÔNG bao giờ vào scene JSON (bài học safe-zone C3: view-layer không vào file).
3. Gõ 1 câu ngắn ("bỏ phản chiếu", "đổi màu chữ này thành trắng") → nút chạy hiện giá **"≈ 1 image edit"** (luật hiển thị; Stop như mọi job).
4. Kết quả về **khay preview của A1** (Replace selected layer / Open in editor / Not now), canvas không auto-mutate (G5); variant persist theo session như A1.
5. Esc / nút X thoát annotate không đốt gì (chưa gọi API = chưa tốn).

### Mapping pixel: cái dễ sai nhất

Ảnh gốc gửi cho API phải là **ảnh pixel gốc của layer** (natural size), và overlay markup phải **cùng kích thước đó**. Nhưng người dùng vẽ ở toạ độ canvas (layer có thể bị scale/rotate). Quy tắc: chụp toạ độ vẽ → inverse-transform về hệ toạ độ natural của layer → rasterize PNG đúng natural size. Layer có transform phi tuyến (skew) v1 **từ chối** nút "Circle to edit" (disabled + tooltip), không im lặng gửi markup lệch.

### Wire & schema (additive, D14)

- `ProviderCapabilities` thêm `markupEdit?: boolean` (default undefined = false, provider cũ không đổi nghĩa).
- `ImageGenInput` thêm `markup?: { dataUrl: string }`, chỉ set khi provider khai `markupEdit`; mock pair xử lý cả happy lẫn các lỗi-path (dims mismatch → lỗi rõ ràng trước khi gọi mạng, overlay >50MB, provider không hỗ trợ).
- Wire openai-images: khi có `markup` → endpoint edits, ảnh gốc vào `images[0]`, markup vào field riêng; **kèm guard kích thước** client-side (so IHDR của 2 PNG) trước khi fetch, lỗi dims là lỗi местного chế tạo overlay, không phải lỗi mạng.
- Cost label & job metered-once như mọi generation (G3): 1 job = 1 ảnh edit, retry = job mới.

### Capability gate (mẫu DA `--search`): cập nhật sau probe

UI hiện nút khi provider khai `markupEdit` với mode bất kỳ ("flatten" cho codex, đã có bằng chứng thật; "field" khi OpenAI wire bật). Mock/mock-ish provider → nút ẩn như cũ. ME-2 mở rộng: wire codex nhận annotation PNG → composite flatten client-side trước khi vào pipeline edit hiện có (`-i` ảnh đã ghép + prompt chỉ dẫn marker).

## Slices

- **ME-1: schema + capability + mock ✅ (2026-11-08):** `markupEdit: "flatten" | "field"` (optional, D14) trên ProviderCapabilities; codex + mock khai `flatten`; `ChatRequest.editMode.markup: literal("flatten")`; clause marker-removal trong `buildEditClauses` (đúng ngôn từ probe P3). Test: clause chỉ xuất hiện khi markup; schema reject `field`/boolean ở boundary.
- **ME-2: flatten wire ✅ (2026-11-08):** composite chạy client-side (`markupComposite`, crossOrigin anonymous như fabric, chống canvas-taint treo promise); provider nhận referenceImages[0] bình thường, không code provider mới. Field-mode wire hoãn (không lane BYO, knip sẽ bắt code chết).
- **ME-3: overlay annotate ✅ (2026-11-08):** lib thuần `markup-annotate.ts` (viewportToNatural/naturalToViewport + composite; 8 unit test toán); overlay rAF vẽ lại mỗi frame (pan/zoom an toàn); CSS `width/height:100%`, bài học death-spiral canvas không-CSS-size; skew layer → từ chối thẳng; object lock trong phiên, Esc thoát 0 quota; annotation KHÔNG BAO GIỜ vào scene JSON.
- **ME-4: UI flow ✅ (2026-11-08):** nút "◎ Circle to edit" trên ContextToolbar (capability-gated); draw → "Done circling" → ask panel (≈ 1 image edit, ẩn trên mock theo luật DA-5) → dispatchAiEdit dùng chung với edit thường → variant tray A1.
- **ME-5: gates ✅ (2026-11-08):** shot scenario ME (exit 30): nút chỉ hiện khi capability, stroke synthetic arms Done, pixel-truth (fabric vẽ + overlay đỏ), card mới về sau khi dismiss-all, purity pin scene JSON, artifact `desktop-editor-markup.png`. Desktop 202 test xanh.

## Câu hỏi còn mở (không chặn ME-1/2)

- Cho vẽ **chữ** trên overlay (annotation text) hay v1 chỉ nét vẽ? (Đề xuất: v1 nét vẽ + prompt chữ, chữ viết tay dễ lỗi OCR hai lớp.)
- Có giữ lại annotation giữa các lần thử (iterate cùng khoanh vùng, đổi prompt) không? (Đề xuất: giữ trong session đến khi thoát Editor, hợp vòng "thử lại cùng một vùng".)
