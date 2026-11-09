---
type: "Design"
title: "Landing feature selection and asset brief"
description: "Feature audit against shipped code, landing priorities, safe claims and a separate review asset pack."
tags: [design, marketing, audit]
status: stable
---

# Chọn tính năng cho landing

## Kết luận

Đừng biến landing thành danh mục công cụ. Câu chuyện chính nên là: **ảnh sản phẩm của bạn → quảng cáo có phong cách → đổi ưu đãi → hoàn thiện trong editor → xuất file**. Livestream là tình huống sử dụng nổi bật riêng. Local-first, mã nguồn mở và hiển thị chi phí là lý do tin tưởng, không cần mỗi mục một hình lớn.

Bộ duyệt gốc nằm ở `site/feature-review/`. Đã tích hợp ảnh tham chiếu, editor, Make text editable và livestream vào `site/index.html` và README, giữ hero MORI và cặp repaint đã có. Nguồn, mã băm và giới hạn bằng chứng: `docs/verification/feature-assets.json`. Chưa triển khai production, không thay template trong app.

## Đối chiếu tính năng

| Tính năng | Trạng thái và căn cứ | Ưu tiên | Cách giới thiệu, giới hạn |
| --- | --- | --- | --- |
| Từ mô tả tạo banner có chữ | `packages/agent/src/designer.ts`, Home mặc định poster theo D16 | Chính, hero | Cho thấy quảng cáo hoàn chỉnh, không chỉ nền đẹp. Không hứa chữ luôn chính xác. |
| Đính kèm ảnh sản phẩm làm tham chiếu | `Home.tsx`, `services/src/chat.ts` materializeLocalRefs, designer truyền referenceImages | Chính, ngay sau hero | Ảnh sản phẩm trước và quảng cáo sau. Không hứa giữ chính xác nhãn hoặc hình học từng pixel. |
| Sửa ưu đãi bằng câu lệnh | designer buildEditClauses, Editor preview/apply; cặp MORI có provenance | Chính | 20% thành 30%, cùng hướng hình ảnh. Đây là repaint có phí, không phải sửa text layer miễn phí. |
| Canvas nhiều lớp, text/shape/upload | `renderer/views/Editor.tsx`; screenshot studio đã xác minh | Chính | Chụp editor thật, chọn một text layer thật. Không vẽ khung UI giả hoặc đánh tráo chữ baked thành layer. |
| Make text editable | Editor dialog và `packages/tasks/src` deconstruct; D16, deconstruct-import.md | Điểm khác biệt, cần demo riêng | Tối đa 1 ảnh + 1 lượt đọc. Đã có poster tiếng Việt: OCR/nền task thật, dựng lại qua code đã sửa và gõ qua editor sản phẩm. Ba ảnh riêng cho mobile, ảnh ghép cho README. Phông gần đúng, OCR cần kiểm; không gọi đây là task trả phí mới sau sửa. |
| Editable text right away | Home editableText → clean-plate, designer blocks | Phụ, cạnh editor | Bật trước khi tạo. Đổi lấy typography native khác typography baked, không hứa hai chế độ giống hệt nhau. |
| Khung livestream và vùng an toàn | `lib/livestream-presets.ts`, Editor guides; screenshot Electron thật | Chính nếu nhắm seller livestream | Overlay trong suốt, guide chỉ ở màn hình, không xuất vào file. TikTok là số đo cộng đồng; Shopee là ước lượng. Không phải chứng nhận nền tảng. |
| Template chỉnh được, hai hệ style | `shared/studio-templates.ts`, STYLE_PRESETS, thư viện trong app | Phụ, một đoạn ngắn | Mở template không dùng quota tạo ảnh. STILL/MORI/FORMA là ví dụ chiến dịch, không phải template đóng kèm. |
| Brand kit | Home brandKitId, `views/BrandKit.tsx`, services context | Phụ | Lưu hướng dẫn, màu, font, logo. Không hứa khóa thương hiệu tuyệt đối hoặc tự tạo bộ nhận diện đồng nhất 100%. |
| Research | designer researchNotes, designer-agent-loop.md có gate thật | Phụ, mục quy trình | Tìm thông tin và kèm nguồn khi provider hỗ trợ. Không hứa mọi thông tin đã được xác minh đúng. |
| Auto refine | designer refine loop, bounded/cost; verification trong reorg | Phụ, mục quy trình | Kiểm tra rồi thử sửa theo brief, có giới hạn vòng. Không gọi là bảo đảm chất lượng hay sửa hết lỗi. |
| Outline trước deck nhiều trang | Home outline, outline-gate.md | Trang use-case presentations | Duyệt dàn ý trước sinh ảnh. Không đẩy lên hero cho seller banner một trang. |
| PNG/JPG/PDF/PPTX/ZIP | Editor export handler và makePptx | Chính, chốt quy trình | PPTX nhúng ảnh từng trang, không hứa text/vector native chỉnh trong PowerPoint. Size preset không đồng nghĩa tự động reflow một thiết kế ra mọi tỉ lệ. |
| Local-first, MIT, macOS/Windows | README, stores và desktop-only-reorg.md | Dải tin cậy, CTA/FAQ | File ở máy; prompt/ảnh vẫn gửi provider. AI dùng quota, không nói miễn phí hoàn toàn hay offline generation. Installer chưa ký, chưa auto-update. |
| Agent API | utility loopback, ForAgents | Footer hoặc trang kỹ thuật | Giá trị thật nhưng lệch persona seller phổ thông. Không chiếm khu vực chính. |
| Bộ công cụ phụ | tools-registry | Không làm trọng tâm | Tránh biến studio thành trang công cụ tạp. Background removal cần rembg. |
| PPT Translator | tools-registry, D5 | Không quảng cáo là đã có | Mới là placeholder. |
| Khoanh vùng để sửa | markup-edit.md, capability gate | Chưa thêm asset mới | Code và gate mock đã có; bằng chứng probe ảnh thật chỉ một phần, không dùng ảnh mô phỏng như đã chạy trọn UI. |
| Split layer | D21, SAM 3 ONNX CPU | Chưa quảng cáo bằng output app | Có PoC và code, gate mô hình thật trọn luồng desktop vẫn mở. Không đánh tráo PoC thành ảnh kết quả app. |
| Cloud sync, chia sẻ web, cộng tác realtime | Không trong scope desktop-only | Loại | Không có. |
| GIF/SVG/model ảnh cụ thể | images-2.6-upgrade.md | Loại khỏi claim mặc định | Không có bằng chứng cho đường plan đang ship. Không đoán model phía sau Codex. |

## Thứ tự landing đề xuất

1. Hero: sản phẩm là gì, dành cho ai, một quảng cáo thật đủ lớn.
2. **Your product photo. A campaign worth posting.** Ảnh tham chiếu và kết quả đặt cạnh nhau.
3. **New offer. Same visual direction.** Cặp MORI trước/sau sửa ưu đãi.
4. **A real canvas. Room to make it yours.** Screenshot editor và text layer thật.
5. **Keep the offer out of the interface.** Vùng an toàn livestream và transparency.
6. Một nhịp đổi hình ảnh: **Different briefs. Distinct visual worlds.** MORI và FORMA, không gán thành output brand kit.
7. Quy trình ngắn, các định dạng xuất, minh bạch quota, FAQ và CTA.

Đã tích hợp bằng ảnh rời và HTML responsive: cặp ảnh tham chiếu, ảnh editor, ba poster khôi phục/gõ sửa, crop artboard livestream. Không lặp lại 5 khung giống nhau trong landing chính. Pack hiện tại dùng chung quy cách xuất ảnh để dễ duyệt; khi tích hợp, giữ copy ngoài ảnh bằng HTML và dùng artwork nguồn để responsive tốt.

## Chỗ nên sửa copy landing hiện tại khi tích hợp

- FAQ nói "plug in your OpenAI/fal API key" dễ hiểu là có form nhập key trong UI. D18 đã rút; đường cấu hình bằng biến môi trường không đồng nghĩa có onboarding key trong app. Nên nói đường mặc định là ChatGPT, cấu hình khác dành cho người dùng kỹ thuật.
- Không khẳng định "same matcha, same typography, same light" như khóa pixel tuyệt đối. Dùng "same visual direction", giữ chú thích chi tiết ảnh có thể đổi.
- Tách rõ "sửa layer không tạo ảnh" và "Make text editable có phí". Không viết chung thành đổi mọi chữ miễn phí.
- Không dùng template demo sinh mới làm ảnh preview thư viện đóng kèm.
- Không thêm số liệu chuyển đổi, doanh thu, thời gian làm hoặc lời chứng thực chưa đo.

## Giới hạn bằng chứng của bộ mới

Hai ảnh STILL được tạo trực tiếp bằng công cụ sinh ảnh tích hợp của Codex, ảnh chiến dịch có đính kèm ảnh sản phẩm. Đây là bằng chứng cho output/reference edit ở kênh ảnh, không phải một lượt end-to-end của Oia gồm planner/research/auto-refine. MORI/FORMA và screenshot editor có provenance cũ. Asset livestream dùng crop screenshot gate thật, không thêm UI hoặc chỉnh số giá trong screenshot.

Ảnh sản phẩm STILL cũng là ảnh AI của nhãn hư cấu, không gọi nó là ảnh thật do một seller cung cấp. Khi phát hành, caption phải giữ điều này hoặc thay bằng ảnh sản phẩm được owner cấp quyền sử dụng.
