---
type: Research
title: "Backlog vấn đề người dùng đáng khai thác tiếp"
status: research
generated: { by: agent, at: 2026-11-13T00:00:00Z }
---

# Backlog vấn đề người dùng đáng khai thác tiếp

Vòng rà nhanh 13/11/2026, nguồn công khai mới + tồn đọng các vòng trước. Mỗi mục: vấn đề, bằng chứng, góc Oia, rào, mức ưu tiên đề xuất. Tất cả vẫn là ứng viên, chưa tăng scope triển khai; ưu tiên thực thi vẫn giữ S0/S1 trước.

## Đã có trong các hướng chính (không lặp lại ở đây)

Cập nhật chiến dịch lặp, batch theo dữ liệu, bảo toàn sản phẩm, nhập liệu sáu cửa (kể cả URL, owner duyệt làm), A/B một trục, đa khổ layout, xuất manifest.

## Danh mục ứng viên mới

### 1. Đếm ngược dịp sale: làm hình phút chót (ưu tiên cao)

Vấn đề: dịp lớn không chờ thiết kế; người làm hình nhận yêu cầu sáng, chiều phải đăng.

Bằng chứng: cẩm nang vật liệu sale lớn dạng checklist của nhà cung cấp ([lovart.ai](https://www.lovart.ai/zh/blog/double-11-design-guide), 30/07/2025); bài báo chí ngành nói quán xá nhận copy buổi sáng, chiều phải phát poster ([baby.ifeng.com](https://baby.ifeng.com/c/8xDUZyXvC1d), 14/10/2026). Cả hai là nội dung công cụ/nhiều khuyến mại, không phải số liệu người dùng.

Góc Oia: bộ preset chiến dịch theo lịch mua sắm Việt (Tết, 2/9, 11/11, 12/12, Black Friday, mùa tựu trường) + checklist vật liệu mỗi dịp (ảnh nào cần, bao lâu trước nên làm). Chiến dịch của người dùng trở thành "đợt sale có sẵn khung", chỉ đổi dữ liệu.

Rào: ngày lễ/doanh thu của sàn phải lấy từ thông báo seller center chính thức từng năm, ghi nguồn và năm; không hard-code mù, không bịa ưu đãi nền tảng.

### 2. Phục hồi ảnh gốc sau đợt sale (ưu tiên cao, chi phí thấp)

Vấn đề: hết sale phải trả ảnh về bản thường, làm tay từng món mệt; công cụ Việt đã bán nút này ([AutoShopee, Phục hồi ảnh gốc](https://blog.autoshopee.com/thiet-ke-khung-anh-san-pham-dong-khung-hang-loat), nội dung nhà cung cấp).

Góc Oia: mô hình chiến dịch đã giữ bản gốc khóa; chỉ cần nút "xuất lại bản gốc của chiến dịch X" trong cùng project, không tính năng mới về mặt dữ liệu. Hợp thú vị: người dùng được đảm bảo bản đang chạy không bị ghi đè.

Rào: không tự đăng lên sàn để "trả về"; Oia xuất file, người dùng tự thay.

### 3. Đóng dấu logo/nước hàng loạt (ưu tiên trung bình)

Vấn đề: shop muốn đóng logo/số điện thoại lên cả loạt ảnh (người làm tool cho seller Etsy mô tả đúng việc này, nguồn vòng R7).

Góc Oia: một role "watermark pass" chạy trên layout + logo của brand kit, 0 AI, xuất cả loạt theo cấu trúc manifest sẵn có.

Rào: tôn trọng kích thước/vị trí của từng sàn do người dùng đặt; không che sản phẩm.

### 4. Kiểm đích đến theo quy tắc sàn (ưu tiên trung bình, phải dữ liệu hóa)

Vấn đề: mỗi sàn có quy tắc ảnh (nền trắng RGB thuần cho main Amazon, tỉ lệ, kích thước tối thiểu, hạn chế chữ/quảng cáo trên main); sai là bị từ chối duyệt. Hướng dẫn quy phạm năm 2026 của nhà cung cấp cho thấy đây là nhu cầu thường trực ([focalflow.app](https://focalflow.app/blog/douyin-product-image-requirements-2026) 06/04/2026, [lovart Amazon](https://www.lovart.ai/zh/blog/amazon-requirements-ai-white-background-images)).

Góc Oia: khi xuất, chạy "destination check": quy tắc khai báo có nguồn và ngày (nền trắng, min-width, số ảnh mỗi listing) rồi hiện pass/fail từng ảnh.

Rào: luật cũ D19 cấm UI copy "platform required" vô căn cứ; quy tắc phải là dữ liệu có nguồn, ngày kiểm, người dùng thấy được; sàn đổi quy tắc thì cập nhật dữ liệu, không cần code lại.

### 5. Ảnh bìa video (ưu tiên trung bình)

Vấn đề: chuỗi vật liệu 2026 luôn gồm cả video cover; Oia không làm video nhưng ảnh bìa là việc ảnh.

Bằng chứng: chuỗi bàn làm việc chính gồm video covers (C16, Mydrivers 10/2026).

Góc Oia: role "cover 9:16 / 16:9" trong bộ ảnh, xuất khung tĩnh để đặt lên video sẵn có của shop; không render video, không hứa thumbnail tự sinh từ video.

### 6. Dịch ảnh cho cross-border (ưu tiên trung bình, hạ tầng đã có gần hết)

Vấn đề: bán đa thị trường cần phiên bản ảnh theo ngôn ngữ; Trung Quốc đã có công cụ dịch ảnh sẵn (Gaoding có mục dịch ảnh, C5).

Góc Oia: skill `oia-image-translate` đã có trong packages/skills; ppt-translate đã ship thật (SG-7). Việc còn lại là wire image-translate thành tool thật: giữ chữ native thay vì vẽ lại chữ, tức là mạnh hơn đối thủ về chất lượng dấu Việt.

Rào: OCR dấu tiếng Việt có ngưỡng sai đã ghi; ảnh có chữ baked mới cần đường tách chữ đắt hơn.

### 7. Trang chi tiết nhiều mô-đun (ưu tiên thấp, việc lớn)

Vấn đề: A+ detail page nhiều mô-đun là phần ăn tiền nhất nhưng nặng nhất; công cụ 2026 làm batch detail module ([Mydrivers 07/2026, C16]).

Góc Oia: sau này mở rộng role "detail strip" từ các mô-đun point bằng layout + dữ liệu, chưa vội.

Rào: đây là scope lớn nhất trong danh sách; chỉ mở khi bộ ảnh + lô nhỏ đã ổn.

### 8. Feedback thật thành ảnh social proof (ưu tiên thấp)

Vấn đề: ảnh quote khách hàng là vật liệu chuyển đổi phổ biến.

Góc Oia: role "review card": người dùng DÁN nguyên văn feedback thật, layout đóng khung, ghi nguồn. Rào cứng: không sinh feedback, không được phép để AI "viết thay khách"; thiếu nguồn thật thì không có role này.

### 9. Biến thể màu SKU thật (ưu tiên thấp, rào cao)

Vấn đề: một ảnh sinh các phiên bản màu cho SKU (Flux Art SKU batch màu, C16).

Rào rất cao theo nguyên tắc đã chốt: chỉ khi seller khai danh sách biến thể THẬT; Oia không tự bịa màu rồi gọi là SKU. Nếu làm, đường an toàn là đổi màu khối nền/đạo cụ, còn màu sản phẩm phải khớp biến thể thật.

### 10. Tham chiếu shop đối thủ, market reference (owner duyệt làm, 13/11/2026)

Vấn đề: người bán cần biết đối thủ đang chạy ảnh nào, giá sao, ưu đãi gì, bố cục nào đang ăn; công cụ Việt đã bán việc này công khai (AutoShopee Kit quảng cáo spy shop đối thủ ngay trên trang sàn, nguồn V1).

Góc Oia:
- **Bảng tham chiếu (reference board):** dán URL listing đối thủ (đường cửa 6) → gom ảnh chính, giá, ưu đãi về một bảng trong project, dán nhãn rõ `reference, không phải tài sản của shop`.
- **Học cấu trúc, không chép tài sản:** bấm "phân tích bố cục" tách vùng (nền, chủ thể, khối giá, khối ưu đãi) thành chú thích; nút "dùng bố cục này với sản phẩm CỦA TÔI" chạy đúng đường sinh từ hồ sơ + ảnh thật của shop.
- Ghi nguồn và ngày cho mọi mục tham chiếu (provenance sẵn có).

Rào: chỉ trang công khai, cùng rào điều khoản của cửa 6; ảnh đối thủ KHÔNG bao giờ vào khay xuất của shop; không bán khẩu hiệu "chôm đồ đối thủ"; sao chép ảnh/logo của người khác là quyết định người dùng tự chịu, Oia không hỗ trợ che nguồn gốc khi làm việc đó.

### 11. Biến thể chống trùng cho TÀI SẢN CỦA CHÍNH SHOP (owner duyệt làm, 13/11/2026)

Vấn đề có văn bản chính thức của sàn: Shopee xử lý sản phẩm trùng lặp, giữ bản đầu/bản bán chạy và gỡ các bản khác ([banhang.shopee.vn](https://banhang.shopee.vn/edu/article/2311), 29/05/2023); nhiều shop nhân bản bị trùng ảnh dẫn mất traffic ([tukigroup.vn](https://tukigroup.vn/trung-traffic-shopee-khi-nhan-ban-nhieu-shop), nội dung bên tư vấn). Shop nhiều listing/nhiều kênh cần CÁC ẢNH KHÁC NHAU THẬT SỰ cho cùng sản phẩm của mình. Thị trường TQ đã đóng gói nhu cầu này (Meitu Xiuxiu bán tính năng biến thể chống lặp cho đăng hàng loạt, nguồn C1).

Góc Oia, **variant pass**:
- Chạy trên đúng bộ ảnh của shop: mỗi biến thể đổi MỘT chiều sáng tạo thật (bố cục khác, nền/bối cảnh khác, tông khác, góc nhấn khác) qua đường sinh ảnh sẵn có, giữ nguyên sản phẩm thật làm lớp.
- Xuất cả loạt theo manifest, mỗi bản là ảnh khác biệt thấy được, phục vụ đăng trên các listing/kênh khác nhau của chính shop.
- Đo được: mức khác biệt giữa các bản (so khối bố cục/màu) trước khi xuất.

Rào trung thực bắt buộc:
- **Chỉ với tài sản có quyền:** ảnh gốc phải từ hồ sơ sản phẩm của shop; không nhận ảnh lạ để "làm mới rồi đăng".
- **Không làm biến thể adversarial thuần túy** (chèn nhiễu, lệch pixel, đổi hash) với mục đích duy nhất là qua máy dò: Oia làm ảnh KHÁC THẬT, không đánh lừa bộ lọc. Nếu hai listing vẫn giống nhau về tên/giá/mô tả thì sàn vẫn có thể xếp trùng theo chính sách, ảnh khác không phải tấm khiên đảm bảo; ghi rõ điều này cạnh nút chạy.
- Không gỡ watermark/nguồn gốc của người khác.

Ưu tiên: cao theo owner; triển khai sau S2 (cần hồ sơ + bảo vệ lớp sản phẩm), tái dùng gần hết đường sinh ảnh + manifest có sẵn.

## Vấn đề có thật nhưng Oia KHÔNG đua

- Đồng bộ tồn kho/giá đa sàn theo thời gian thực: nguồn hướng dẫn bán hàng nêu đây là phần khó vận hành ([upscalerank](https://upscalerank.com/how-to-sell-on-lazada), hướng dẫn bên thứ ba), nhưng đó là bài toán ERP, không phải công cụ hình; Oia chỉ cần không làm người dùng nhầm dữ liệu giá (duyệt trường giá).

Ghi chú owner 2026-11-13: hai mục "tham chiếu đối thủ" và "chống ảnh trùng" chuyển từ không-đua sang PHẢI LÀM, thiết kế ở mục 10, 11: tham chiếu đối thủ chỉ học cấu trúc từ trang công khai, không chép tài sản; chống trùng chỉ chạy trên tài sản của chính shop bằng biến thể sáng tạo thật, không làm biến thể adversarial để đánh lừa bộ dò, không che nguồn gốc ảnh người khác.

## Nguồn mới của vòng này

Đã liệt kê URL kèm ngày trong từng mục. Các bài đều của nhà cung cấp hoặc bên thứ ba, dùng để nhận diện vấn đề, không dùng số quảng cáo làm bằng chứng hiệu quả. Vòng này chỉ tài liệu, không code, không chi phí. `git diff --check` sạch.
