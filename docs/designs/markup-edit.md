# ME — Markup edit "khoanh để sửa": sửa ảnh bằng bút vẽ, không bằng câu chữ

**Ngày:** 2026-11-07 (tốt nghiệp từ [images-2.6-upgrade.md](images-2.6-upgrade.md) IM26-3, owner duyệt hướng trong đợt "Duyệt hết")
**Trạng thái:** DRAFT thiết kế — code chưa bắt đầu; slice đầu tiên chờ owner thấy doc này xong gật.
**Tác giả:** cuongducle + agent
**Liên quan:** [variant-preview-apply.md](variant-preview-apply.md) (khay preview — kết quả markup edit đi đúng khay này), [deconstruct-import.md](deconstruct-import.md) (B1 cùng endpoint /edits), [designer-agent-loop.md](designer-agent-loop.md) (capability gating mẫu của `--search`).

## Vì sao làm

"Replace **cái** chai — cái thứ ba từ trái" là câu prompt không ai viết đúng nổi; khoanh tròn cái chai thì ai cũng làm được. Images 2.6 mở markup-guided editing trên API (ảnh gốc + 1 layer PNG transparent chú thích ở field riêng — khoanh/mũi tên/chữ viết tay), hỗ trợ cả model 2.5. Đây là tính năng **đúng DNA "Layers, not magic"** của Oia: canvas đã là layer, annotation chỉ là một lớp view tạm sinh ra từ chính canvas.

## Dữ kiện API (đã verify IM26-0)

- Endpoint: `/v1/images/edits`; ảnh đầu tiên trong `images[]` là ảnh **được sửa**; ảnh thêm = reference; layer chú thích đi field **riêng** (`markup`), KHÔNG flatten vào ảnh.
- Ràng buộc cứng: layer markup **cùng kích thước pixel đúng** ảnh gốc; mỗi ảnh ≤ 16.777.216 px; file markup ≤ 50 MB; không kết hợp mask hay prompt rewriter.
- Provider hỗ trợ: OpenAI wire (BYO key). **Codex `$imagegen` chưa có markup field** → lane plan KHÔNG mở tính năng này (capability gate), đến khi codex CLI hỗ trợ.

## Thiết kế

### Luồng người dùng

1. Editor → chọn layer ảnh → ContextToolbar có nút **"Circle to edit"** (bên cạnh "Make text editable" D16).
2. Vào chế độ annotate: con trỏ thành bút; vẽ tự do (mặc định **đỏ**, nét dày ~1,5% cạnh ngắn — đỏ là màu markup mà modeldocs dùng làm ví dụ; không cho đổi màu v1). Vẽ trên **overlay view-layer**, KHÔNG bao giờ vào scene JSON (bài học safe-zone C3: view-layer không vào file).
3. Gõ 1 câu ngắn ("bỏ phản chiếu", "đổi màu chữ này thành trắng") → nút chạy hiện giá **"≈ 1 image edit"** (luật hiển thị; Stop như mọi job).
4. Kết quả về **khay preview của A1** (Replace selected layer / Open in editor / Not now) — canvas không auto-mutate (G5); variant persist theo session như A1.
5. Esc / nút X thoát annotate không đốt gì (chưa gọi API = chưa tốn).

### Mapping pixel — cái dễ sai nhất

Ảnh gốc gửi cho API phải là **ảnh pixel gốc của layer** (natural size), và overlay markup phải **cùng kích thước đó**. Nhưng người dùng vẽ ở toạ độ canvas (layer có thể bị scale/rotate). Quy tắc: chụp toạ độ vẽ → inverse-transform về hệ toạ độ natural của layer → rasterize PNG đúng natural size. Layer có transform phi tuyến (skew) v1 **từ chối** nút "Circle to edit" (disabled + tooltip) — không im lặng gửi markup lệch.

### Wire & schema (additive, D14)

- `ProviderCapabilities` thêm `markupEdit?: boolean` (default undefined = false — provider cũ không đổi nghĩa).
- `ImageGenInput` thêm `markup?: { dataUrl: string }` — chỉ set khi provider khai `markupEdit`; mock pair xử lý cả happy lẫn các lỗi-path (dims mismatch → lỗi rõ ràng trước khi gọi mạng, overlay >50MB, provider không hỗ trợ).
- Wire openai-images: khi có `markup` → endpoint edits, ảnh gốc vào `images[0]`, markup vào field riêng; **kèm guard kích thước** client-side (so IHDR của 2 PNG) trước khi fetch — lỗi dims là lỗi местного chế tạo overlay, không phải lỗi mạng.
- Cost label & job metered-once như mọi generation (G3): 1 job = 1 ảnh edit, retry = job mới.

### Capability gate (mẫu DA `--search`)

UI chỉ hiện nút khi provider hiện tại `capabilities.markupEdit === true`. Codex/mock → nút ẩn hẳn (không disabled gây thắc mắc) — cùng triết lý "provider không hỗ trợ → thông báo thẳng" của DA.

## Slices

- **ME-1 — schema + capability + mock** (0 quota): field `markup`, cờ capability, mock provider trả ảnh "đã sửa" deterministic; test lỗi-path (dims, size, unsupported).
- **ME-2 — wire openai** (0 quota): gửi markup field đúng spec; guard dims client-side; test bằng fake server (giống pattern test wire hiện có). **Generation thật verify: 1 ảnh, chờ owner duyệt riêng lần đó.**
- **ME-3 — overlay annotate trong Editor** (0 quota): view-layer vẽ tự do, inverse-transform rasterize, nút disabled khi transform phi tuyến; annotation KHÔNG persist vào project.
- **ME-4 — UI flow + khay preview** (0 quota): nút ContextToolbar, hộp prompt + cost label, kết quả vào khay A1.
- **ME-5 — gates**: shot scenario mới (annotate → preview tray xuất hiện); test pin "annotation không bao giờ nằm trong scene JSON" (bytes/structure check — bài học C3).

## Câu hỏi còn mở (không chặn ME-1/2)

- Cho vẽ **chữ** trên overlay (annotation text) hay v1 chỉ nét vẽ? (Đề xuất: v1 nét vẽ + prompt chữ — chữ viết tay dễ lỗi OCR hai lớp.)
- Có giữ lại annotation giữa các lần thử (iterate cùng khoanh vùng, đổi prompt) không? (Đề xuất: giữ trong session đến khi thoát Editor — hợp vòng "thử lại cùng một vùng".)
