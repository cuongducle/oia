---
type: Research
title: "Cỡ nhu cầu VN cho xưởng hình bán hàng và cách đo"
status: research
generated: { by: agent, at: 2026-11-13T00:00:00Z }
---

# Cỡ nhu cầu và cách đo, không dùng khảo sát trực tiếp

Trả lời câu hỏi owner 13/11/2026: "nhu cầu này có lớn không, khảo sát nhu cầu như thế nào". Mọi con số dưới đây có nguồn hoặc ghi rõ là giả định; không có nguồn nào được đọc thành "người dùng Oia sẽ là X".

## 1. Số liệu có nguồn

| Chỉ số | Giá trị | Nguồn, ngày |
| --- | --- | --- |
| Gian hàng phát sinh doanh thu, 4 sàn lớn (Shopee, TikTok Shop, Lazada, Tiki), 9 tháng 2026 | hơn 436.000 | YouNet ECI qua [VietnamPlus](https://www.vietnamplus.vn/26-ty-san-pham-ban-ra-tren-san-thuong-mai-dien-tu-viet-nam-trong-9-thang-post1143041.vnp), 20/10/2026 |
| Q3/2026: non-mall có doanh thu 380.307, mall 19.518; non-mall vẫn thấp hơn cùng kỳ 2025 khoảng 8% | ~400.000 | cùng nguồn |
| GMV 4 sàn 9 tháng 2026 | 411,7 nghìn tỷ đồng (~15,8 tỷ USD) | cùng nguồn |
| Sàng lọc: hơn 86.300 nhà bán Shopee không phát sinh đơn năm 2024 | bằng chứng churn lớn | [Advertising Vietnam](https://advertisingvietnam.com/article/buc-tranh-thuong-mai-dien-tu-nam-2025-shopee-va-tiktok-shop-tiep-tuc-thong-linh-thi-truong-cac-nen-tang-mang-xa-hoi-tro-thanh-kenh-ban-hang-tiem-nang-cua-thuong-hieu-p26018), 24/02/2025 |
| TikTok Shop vượt Shopee về số nhà bán hoạt động, ~41% thị phần | tín hiệu, nguồn blog bên thứ ba độ tin thấp hơn | [OneTik](https://onetik.vn/thi-truong-thuong-mai-dien-tu-viet-nam.html), 29/01/2026 |
| Giá thuê làm bộ banner Shopee: khoảng 300 đến 400 nghìn đồng/bộ | mỏ neo chi phí hiện tại, giá tự báo trong nhóm designer | [nhóm FB designer](https://www.facebook.com/groups/cuocsongdesigner/posts/1627776191867687), không kiểm chứng |
| Ngành lớn Q3/2026: thời trang + phụ kiện 39,3 nghìn tỷ; FMCG 29,4; beauty 18,9 | khớp 3 ngành ứng viên của blueprint 13.4 | VietnamPlus trên |

## 2. Phễu ước lượng (mọi tầng giả định đều ghi rõ)

```text
436.000  gian hàng có doanh thu 9T/2026            [nguồn]
  x~65%  sống qua năm (churn đã chứng minh)         [giả định từ số churn]
~280.000  shop bán có đều trong năm
  x30-50%  có cập nhật hình theo đợt sale/Tết       [giả định: văn hóa 11/11, 12/12, Tết]
~90-140.000  shop có "việc làm hình lặp"
  x10-20%  dùng máy tính + chịu cài app local 400MB chưa ký  [giả định]
~9.000-30.000  TẦP PHỤC VỤ THỰC SỰ CỦA OIA v1
  x1-5%   đạt được trong năm đầu bằng SEO           [giả định thận trọng]
~100-1.500  người dùng năm đầu
```

Kết luận trung thực: **việc làm hình lặp tồn tại ở quy mô chục nghìn shop trở lên; tệp thực sự phục vụ được của Oia v1 là hàng nghìn đến vài chục nghìn; năm đầu bằng SEO chỉ mong trăm đến hơn nghìn người dùng.** Đủ lớn cho một sản phẩm một người làm; chưa ai chứng minh được quy mô trả tiền.

Mỏ neo giá trị thay thế: một bộ banner thuê ngoài 300-400 nghìn đồng; shop chạy 4-6 đợt/năm chi 1,2-2,4 triệu (~50-95 USD), xấp xỉ nửa giá Canva Pro một năm cộng nguồn lực tự làm. Oia free bắn trúng khoản chi này.

Phản chứng phải ghi kèm: nhiều shop không có đơn nào; phần lớn thao tác trên điện thoại; khung miễn phí và Canva free đã phủ nhu cầu cơ bản; "dùng free" khác "sẵn lòng trả tiền cho Oia" (mô hình thu nhập vẫn chưa định).

## 3. Khảo sát nhu cầu bằng phép đo, không phỏng vấn

| Cách | Đo gì | Chi phí | Khi nào |
| --- | --- | --- | --- |
| Search volume VN: "banner shopee", "đóng khung ảnh shopee", "thiết kế ảnh shopee", "canva shopee", "ảnh shopee chuẩn" | nhu cầu chủ động tồn tại bao lớn, xu hướng theo mùa sale | 0 (Keyword Planner/Trends) | làm được ngay, không cần code |
| Search Console trên site sau khi có trang đích SEO | impress/click thật theo từ khóa, tỷ lệ vào trang cài | 0 | theo đà SEO đã chốt |
| Lượt tải bản release theo phiên (đã có sẵn counter GitHub) | cầu thật theo tính năng mới | 0 | ngay từ bản kế tiếp |
| Đếm nội dung cộng đồng: số bài hỏi/hướng dẫn làm banner shopee mỗi tháng trong nhóm lớn, dung lượng nhóm | mật độ nhu cầu và chỗ người ta hỏi | thấp, thủ công định kỳ | mỗi 1-2 tháng |
| Tracked đối thủ: giá/gói AutoShopee, gig thiết kế banner trên fastlance (số gig, mức giá), bài BigSeller về AI ảnh | người ta đã trả tiền cho việc này cỡ nào | thấp | định kỳ |
| Funnel sản phẩm tự nguyện (opt-in, ẩn danh: mở app, tạo hồ sơ, xuất đầu tiên) | chỗ rò thật sau khi có người dùng | cần quyết định thêm telemetry vì app hiện không có | chỉ khi owner duyệt, tôn trọng local-first |

Ngưỡng đọc kết quả (đề xuất, không phải chuẩn ngành): volume từ khóa chủ chốt hàng nghìn lượt/tháng trở lên và khoảng 5-10% người vào trang cài thực sự tải = tín hiệu đủ để tăng tốc đầu tư SEO/nội dung; dưới mức đó giữ tốc độ tối thiểu, không kết luận "nhu cầu không có" vì kênh chưa chạy.

## 4. Việc thêm vào plan từ nghiên cứu này

Không mở W mới. Ghi thêm: (a) phép đo search volume là việc 0 đồng, xếp vào lúc bắt đầu Pha 0 như dữ liệu nền; (b) telemetry tự nguyện chỉ làm khi owner duyệt (rủi ro ro riêng, không mặc định). Cả hai đã ghi một dòng trong execution-plan.

## 5. Vòng 2 (chiều 13/11/2026): nghiên cứu lại sau đính chính "giá không nằm trên ảnh chính"

Sau khi owner chỉ ra quy định sàn và đã kiểm chứng (TikTok cấm giá gây hiểu lầm trên ảnh; Mall đòi ảnh chụp thật), giả định "đổi giá trên ảnh mỗi tuần" không còn là việc. Nghiên cứu lại từ đầu tập trung bằng chứng VN mới:

### 6.1 Nguồn mới

| ID | Nguồn, ngày | Loại | Điều cho thấy |
| --- | --- | --- | --- |
| D1 | [Fastlance, danh mục thiết kế banner Shopee](https://fastlance.vn/social-media-banner/shopee), đọc 13/11/2026 | Chợ dịch vụ (cung đang bán = cầu tồn tại) | Các gói thực tế: banner trang chủ/sự kiện quanh 9.9, 10.10, 11.11, 12.12, Tết, Black Friday; banner khuyến mãi sản phẩm và combo; banner Mall; banner động GIF; "template đồng bộ cho tất cả hình ảnh sản phẩm". Tuyên bố "hàng trăm gian hàng" là marketing, chưa kiểm chứng |
| D2 | [TikTok Shop, Shop Page Design](https://seller-vn.tiktok.com/university/essay?knowledge_id=6837790809687809), 28/07/2026 | Chính thức | Sàn có sẵn builder kéo-thả trang trí cửa hàng (banner, carousel ảnh, multi-click image, khối khuyến mãi thông minh) kèm duyệt nội dung: phần trang trí GENERIC đã bị sàn hấp thu |
| D3 | [Shopee, Trang Trí Shop](https://banhang.shopee.vn/edu/article/1857), 05/10/2022 | Chính thức | Banner template sẵn trong Seller Center, tối đa 10 thiết kế mỗi loại: tương tự D2 |
| D4 | [Tukigroup, khi nào nên thay ảnh sản phẩm và banner](https://www.facebook.com/tukigroupvnofficial/posts/122173395632688121), 05/04/2026 | Nội dung tư vấn bán khóa học (độ tin trung bình) | Bản thân câu hỏi "khi nào thay" tồn tại như nội dung marketing: nhịp đổi ảnh là chủ đề đủ nóng để bán tư vấn |
| D5 | [Nhóm FB tự thiết kế background livestream TikTok/Shopee](https://www.facebook.com/groups/congdongthietkeecommerce/posts/1259493672631092) + gig [Background Livestream trên fastlance](https://fastlance.vn/user/nguyentran97/prop-stylist-85815072) + hướng dẫn overlay bằng điện thoại của EcomDesign | Cộng đồng + chợ dịch vụ | Livestream assets là việc HẰNG NGÀY của shop đang live, có cả dịch vụ trả phí bên cạnh |

### 6.2 Phân loại lại các việc làm hình theo tần suất và bằng chứng

| Việc | Tần suất | Bằng chứng | Mức thay thế đã có | Đánh giá lại |
| --- | --- | --- | --- | --- |
| A. Bộ ảnh sản phẩm mới (main sạch + ảnh phụ điểm bán/chi tiết) | Mỗi lần lên sản phẩm | D1 (dịch vụ template đồng bộ), nghiên cứu TQ C2/C16 | Tự làm Canva; thuê ngoài | Còn đứng, không đổi |
| B. Tài sản theo đợt chiến dịch (banner shop 1200x600, banner sự kiện, ảnh khuyến mãi sản phẩm) | 8-10 đợt lớn/năm + flash sale hằng tuần | D1 (danh mục gói quanh các đợt sale), D4, giá 300-400k/bộ từ vòng 1 | Builder của sàn (D2/D3) hấp thu phần generic; thuê ngoài | **TRỤ NHỊP LẶP THẬT**; Oia phải thắng builder sàn ở: đa sàn cùng dữ liệu, brand nhất quán, tái dùng, không duyệt từng lần |
| C. Livestream assets (background, overlay, thẻ giá) | Hằng ngày với shop đang live | D5 | Overlay có sẵn trong app live; thuê ngoài | **Tần suất cao nhất danh mục**; Oia đã có preset overlay, cần đưa thành luồng chính |
| D. Nội dung social dẫn về shop | Liên tục | Nghiên cứu TQ (C16), sinh tồn của các nhóm design TMĐT | Canva, CapCut | Trung bình |
| E. Biến thể chống trùng cho tài sản mình | Mỗi lần nhân listing/đa kênh | Chính sách trùng Shopee (vòng trước), owner duyệt làm | Meitu kiểu TQ; làm tay | Còn đứng (owner bắt buộc) |
| F. ~~Chữ giá trên ảnh chính~~ | Không tồn tại theo quy định | Đính chính 13/11 | | **BỎ KHỎI LUỒNG BÁN**; giá chỉ nằm ảnh phụ/overlay/banner |

### 6.3 Kết luận vòng 2

1. Nhu cầu không mất đi, nó **đổi nhịp**: từ "đổi giá mỗi tuần" (sai) sang "đổi chiến dịch theo đợt sale + livestream hằng ngày" (có bằng chứng cung cấp dịch vụ và nội dung tư vấn). Con số phễu mục 2 giữ nguyên vì đáy phễu (số shop) không đổi; câu chuyện sản phẩm đổi trọng tâm: W3.4 (preset lịch sale) và luồng livestream overlay thành trụ cùng bộ ảnh sản phẩm.
2. Luồng B (Update a campaign) giữ tên và giá trị nhưng văn án đổi: "đổi ưu đãi/đợt sale trên banner, ảnh phụ, overlay; ảnh chính không đụng", không còn nói "đổi giá trên banner".
3. Rủi ro thay thế mới phải ghi rõ: nếu Oia chỉ là công cụ trang trí thì thua builder sẵn trong Seller Center (D2/D3). Cái chết là làm generic; chỗ sống là đa sàn + hồ sơ sản phẩm + tái dùng + nền AI cho ảnh phụ.
4. W0.2 thêm kịch bản bắt buộc: đổi ưu đãi chiến dịch (banner shop + ảnh phụ offer + overlay livestream) trên profile sạch, main không đổi, 0 lượt AI.

### 6.4 Còn thiếu bằng chứng gì (ghi trung thực)

- Chưa có số lượt tìm kiếm từ khóa (cần Keyword Planner/Trends, đã xếp vào Pha 0).
- Chưa đếm được số gig/số đơn trên fastlance (trang không trả số liệu công khai qua reader).
- Chưa có nguồn độc lập nào xác nhận tần suất flash sale hằng tuần của shop VN; hiện dựa vào danh mục dịch vụ + nội dung tư vấn, cả hai đều có động cơ bán hàng. Khi có Search Console/download thật, thay các giả định này bằng số đo.

## 6. Giới hạn

Số YouNet ECI đếm gian hàng có doanh thu, không phải "người quyết định làm hình"; tỷ lệ tầng 3 trở xuống là giả định của tôi, thay bằng số đo thật khi có. Giá banner là giá tự báo một bài đăng, chưa phải mặt bằng. Không nguồn nào nói gì về sẵn lòng cài app local.

Chỉ nghiên cứu, không code, không chi phí. `git diff --check` sạch.
