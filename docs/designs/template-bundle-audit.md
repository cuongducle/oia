---
type: "Verification"
title: "Bundled template audit"
description: "Audit of all shipped scenes, taxonomy repair, visual fixes, and repeatable real Fabric rendering."
status: stable
tags: [templates, desktop, verification]
---

# Rà soát bộ mẫu đóng kèm, 2026-11-12

## Trạng thái cuối: đã tạo ảnh mới theo phản hồi owner

Owner bác kết quả vòng đầu: sửa bố cục và giữ nền màu không đáp ứng yêu cầu
làm lại mẫu xấu. Đã chạy **8 lượt tạo ảnh mới thật** qua provider Codex:
`swiss-flashsale`, `swiss-spec`, `swiss-statement`, `ed-menu`, `ed-feature`,
`tet-swiss` (asset `tet-red`), `tet-voucher` (asset `tet-gold`), `perspective`.
Không retry, không vision read, không planner turn; meter: 8 image calls.
Tất cả ảnh gốc đã được mở trước khi đóng gói; chữ được bố trí lại theo vật
thể thực tế trong ảnh, không đặt nguyên bố cục cũ lên ảnh mới.

Cả 30 Studio template đang hoạt động nay có ảnh nền/ảnh chủ thể thật trong
scene. Chỉ 3 livestream và 2 overlay giữ đồ họa native trên nền trong suốt,
đúng công dụng ghép lên video. Giữ nguyên tổng 35 mẫu và 8 nhóm.

Ảnh mới dùng URL có phiên bản `*-ai-20261112.webp`, giữ asset cũ để tài liệu
đã lưu không đổi nền ngoài ý muốn. Đầu ra PNG của provider được co/cắt giữa
rất nhẹ về đúng tỷ lệ artboard (sai khác tỷ lệ dưới 1%), không kéo méo.
Tổng dung lượng 8 WebP mới khoảng 972 KiB trên máy này.

Bằng chứng: `docs/private/real-runs/2026-11-12-template-backgrounds-ai/` có
prompt, task ids, meter, PNG gốc, SHA-256, bảng ảnh trước/sau và bản cuối.
Prompt chính xác cũng nằm trong `shared/template-provenance.ts`; test đối
chiếu với manifest và buộc scene trỏ ảnh mới, không rơi về nền cũ.

Kiểm mắt bản hoàn chỉnh: (1) phân cấp và ngắt dòng tiêu đề, (2) tương phản
chữ trên ảnh, (3) chữ không đè lên sản phẩm, (4) giữ tỷ lệ và chủ thể ảnh,
(5) độ thoáng và nhịp chữ, (6) giá và tên sản phẩm đúng bối cảnh. Ví dụ menu
phải nâng footer lên vì tách cà phê thực tế cao hơn vùng trống đã yêu cầu;
voucher chuyển mã/giá sang cột trái để tránh phong bao; spec lamp gom bảng
sang trái và làm đậm chữ phụ trên nền xám.

Gates bản cuối macOS: build/test/typecheck toàn repo, smoke, crash-smoke,
shot và template-qa đều qua. 35 scene dựng thành công, 0 khung chữ tràn hoặc
chồng nhau; desktop 288 test qua, 1 manual test bỏ qua. Đã mở ảnh trước/sau,
bảng 8 mẫu hoàn chỉnh, ảnh kích thước gốc và ảnh Home từ shot thật. Đây là
kiểm chứng trên ảnh mới thật, không phải một concept Image Gen được owner
duyệt trước. Chưa kiểm Windows thật hoặc site SEO.

## Vòng đầu: phạm vi và quyết định (owner đã yêu cầu làm lại)

Theo yêu cầu owner: kiểm tra mock, sửa thiết kế chưa đạt, phân loại và bổ sung
nhóm thiếu. Không mở rộng taxonomy tùy tiện: dùng đủ 8 nhóm hiện có của
`@oia/schema`. Home và Editor cùng đọc `shared/bundled-templates.ts`.
Bộ lọc hiện cả ở Featured, không phải chuyển sang All templates mới thấy.

Không tìm thấy scene đóng kèm chỉ có ảnh giả của mock provider hoặc ô trống
thay cho thiết kế. Có 8 nền tạo bằng mã trước vòng sửa, không phải mock:
chúng là thiết kế chữ, đường kẻ và màu có thể sửa thật. Bản vòng đầu dùng
7 nền loại này, 23 scene ảnh (có tái sử dụng ảnh), 3 livestream và 2 overlay.
Lựa chọn giữ nền màu này đã bị owner bác ở vòng tiếp theo.
Không khẳng định có bằng chứng nguồn sinh AI riêng cho mọi ảnh cũ.

Một giới hạn dễ gây hiểu nhầm: Countdown frame là **ảnh chữ tĩnh**, không có
bộ đếm chạy. Giữ công dụng thiết kế, thêm nhãn `Static` ở Home và Editor;
không quảng cáo một chức năng chưa tồn tại.

## Danh mục sau sửa

| Nhóm | Số mẫu | Thay đổi |
|---|---:|---|
| Flash sale | 5 | Không còn bị gộp vào Poster |
| New product | 5 | Không còn bị gộp vào Social |
| Livestream | 3 | Đưa preset có thật vào Home, giữ id cũ và vùng an toàn |
| Menu | 4 | Bộ lọc riêng, không trộn với Poster |
| Social post | 7 | Giữ đúng id taxonomy |
| Presentation | 2 | Đổi cả hai bìa từ dọc sang 1600 × 900 |
| Poster | 7 | Sửa tương phản, bố cục và một nền quá trống |
| Overlay | 2 | Bổ sung lower third giới thiệu người dẫn và banner ưu đãi góc |
| **Tổng** | **35** | 30 Studio cũ + 3 livestream có sẵn + 2 mẫu mới |

Overlay dùng đối tượng native trên nền trong suốt 1920 × 1080, không ảnh
chụp UI, không URL ngoài. Đây là đồ họa chung cho video/stream, không phải
preset vùng an toàn cho một nền tảng. Không thêm gói trả phí hay gọi provider.

## Các mẫu đã sửa

| Id Studio | Vấn đề | Sửa |
|---|---|---|
| botanical | Khung brand quá rộng chạm cột phải | Thu gọn khung |
| perspective | Bìa thuyết trình khổ dọc, nhịp chữ rời | Bố cục 16:9, cột chữ trái, nền trừu tượng phải không kéo méo |
| menuboard | Chữ xuyên lên ảnh bánh, giá thiếu đơn vị | Tấm giấy riêng bên phải, giá có đơn vị |
| swiss-statement | Khung số và chú thích chạm nhau | Hạ chú thích, giữ trục cột |
| ed-holiday | Nền tối gần như trống | Dùng lại ảnh `holiday.webp`, serif trên vùng trống, đúng tỷ lệ ảnh |
| ed-product2 | Chữ thấp, tiêu đề và mô tả chạm nhau | Chuyển cụm chữ lên trái, sửa khoảng cách và copy |
| ed-holiday2 | Chữ đè lên hộp quà và ruy băng | Chuyển sang vùng âm phía trái |
| ed-poster2 | Chữ nâu chìm vào nền tối | Chữ kem sáng, copy ngắn và thoáng hơn |
| ed-street | Chữ thiếu tương phản | Tấm giấy sáng, giữ ảnh món ăn; sửa tên món |
| ed-fashion | Mô tả dễ chạm đường kẻ và dòng sản phẩm | Copy ngắn, tăng khoảng cách dọc |
| swiss-sneaker | Tiêu đề và mô tả chạm nhau | Tách mô tả, kẻ và thông số xuống dưới |
| ed-deck | Khổ dọc, tiêu đề chạm mô tả | Bìa 16:9, ảnh bên phải đúng tỷ lệ, phân cấp lại chữ |
| tet-flashsale | Khung giá và hạn ưu đãi chạm nhau | Thu khung giá, giữ hai cột |
| tet-greeting | Nội dung `@YOURSHOP` thiếu chăm chút | Tên thương hiệu mẫu cụ thể |

Những mẫu còn lại đã được dựng và xem trong bảng ảnh, giữ nguyên thiết kế.
Thay đổi scene mẫu không ghi đè project người dùng hoặc sample đã lưu trước đó.
Muốn dùng bản mới, mở từ kho template, không sửa tự động tài liệu cũ.

## Kiểm chứng

- `pnpm --filter @oia/desktop template-qa`: Electron thật, Fabric thật,
  phông Be Vietnam Pro đóng kèm, ảnh WebP đóng kèm, xuất PNG đúng kích thước
  từng scene và JSON hình học. Không dùng PIL để kết luận vị trí chữ.
- Lượt đầu bắt 6 scene có khung chữ giao nhau; bản cuối **35/35 dựng được,
  không có chữ tràn artboard, không có hai khung chữ giao nhau**. Đây là
  phép đo khung, không tự động chứng minh tương phản hay toàn bộ thẩm mỹ.
- Đã mở bảng ảnh 35 mẫu và ảnh kích thước gốc của các mẫu sửa chính: menu,
  gốm, phở, serum, quà, hai bìa thuyết trình. Soi phân cấp chữ, khoảng cách,
  tương phản, vị trí so với sản phẩm, tỷ lệ ảnh và nội dung mẫu.
- Shot mở app thật, bấm đủ 8 nhóm, kiểm tra mẫu đóng kèm không biến mất và
  mẫu nhóm khác không lọt vào. Shot cũ vẫn áp mẫu livestream vào Editor và
  xuất PNG trong suốt qua đường thật. Đã mở ảnh Home sau sửa.
- Gates: build, test, typecheck toàn repo; desktop smoke, crash-smoke, shot;
  template-qa đều xanh trên máy macOS. Desktop: 287 test qua, 1 manual test
  bỏ qua theo cấu hình có sẵn.
- Bằng chứng cục bộ: `docs/private/real-runs/2026-11-12-template-bundle/`.
  Harness lặp lại được nằm trong `apps/desktop/scripts/template-qa*`.

Giới hạn: không chạy máy Windows thật, không sinh ảnh AI mới, không có concept
Image Gen mới (phiên không có công cụ đó). Đây là chỉnh sửa trên bộ ảnh và
ngôn ngữ thiết kế có sẵn, không tuyên bố khớp một concept được owner duyệt.
Không sửa site SEO hoặc thư viện template do người dùng tự xuất bản.
