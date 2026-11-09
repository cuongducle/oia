# IM26 probes: bằng chứng thật trên đường codex (2026-11-08)

Owner: "dùng codex đi" (sau khi máy xác nhận không có OpenAI API key). Pin **rust-v0.167.0** (bump theo luật D12 cùng ngày, REAL_SMOKE OK, cặp đã kiểm). Mỗi probe chạy bằng chính binary đóng kèm app + prompt stdin (giữ nguyên hình dạng `codex exec` của bridge). **Quota tiêu cả đợt: 2 ảnh** (1 REAL_SMOKE pin bump + 1 probe markup) + text token.

## P2: SVG-as-code: PASS (0 ảnh, 18 giây)

Prompt: "Write a clean minimal SVG file … Do NOT generate any raster image". Codex viết `badge.svg` (file này ở cạnh), 659 bytes, pure vector path, đúng 3 màu, không gọi $imagegen, không raster.

**Ý nghĩa sản phẩm:** IM26-5 (SVG → vector layer) **không cần API key lẫn ảnh**: đi đường LLM của codex, `fabric.loadSVGFromString` nhận thẳng. Giá = text token của 1 lượt exec. Thiết kế lại slice: SVG layer = lane planner (kiểu B1/DA), không phải lane image.

## P1: GIF qua $imagegen: KHÔNG (0 ảnh, 10 giây)

Prompt yêu cầu GIF + dặn "nếu tool không làm GIF được thì nói thẳng". Trả lời: **"The image generation tool cannot produce animated GIF files"**: từ chối tường minh, không sinh ảnh tĩnh (không phí quota). Trên pin 0.167 (sau 2.6) GIF vẫn là API-only. IM26-4 giữ kết luận cũ: chờ có key.

## P3: Markup edit (annotation FLATTEN): PASS một phần (1 ảnh, 68 giây)

Input: template `ed-product2` + ellipse đỏ vẽ quanh dòng giá (file `markup-input-annotated.webp`). Yêu cầu: xoá ellipse, đổi "890.000₫, 30 ml" → "1.290.000₫, 30 ml", giữ mọi thứ khác.

Kết quả (`markup-output-codex.webp`, chấm bằng vision):
1. ✅ Xoá sạch annotation (không sót vệt đỏ)
2. ⚠️ Giá đúng "1.290.000, 30 ml" NHƯNG glyph ₫ render hơi dị (đ/g lai), artifact mức ký tự, đúng loại lỗi critic auto-refine đã biết bắt
3. ✅ Toàn bộ phần còn lại giữ nguyên (serif, chai, màu, layout)

**Ý nghĩa sản phẩm:** giả định "codex không có markup field → lane plan không làm được" là **SAI**. Lane codex làm được biến thể degraded: annotation flatten vào ảnh + chỉ dẫn chữ, model hiểu "vòng tròn đỏ = vùng cần sửa" VÀ tự dọn marker. Thiết kế ME cập nhật: ship được trên CẢ HAI lane (API: field riêng, tách lớp; codex: flatten, rẻ hơn vì không cần key). Lỗi glyph ₫ đi qua vòng critic như mọi generation.

## Đối chiếu lại slices IM26

| Slice | Trước probe | Sau probe |
|---|---|---|
| IM26-4 GIF | hoãn chờ key | **khẳng định NO trên codex**: chỉ API |
| IM26-5 SVG | hoãn chờ key (API-only) | **PASS qua codex text lane, 0 ảnh**: mở lại được ngay |
| IM26-6 complexity | hoãn chờ key | không đổi (không có knob trên codex) |
| ME markup edit | BYO-only, codex ẩn nút | **cả 2 lane**: codex = biến thể flatten (đã có bằng chức năng thật) |
