---
title: 'ChatGPT và Gemini gợi ý công cụ làm banner nào?'
description: '4 lần đo, 10 câu hỏi tiếng Việt, 2 trợ lý AI. Canva được nêu trong cả 56 câu trả lời; một công cụ nhỏ 0 lần. Kèm dữ liệu, phương pháp, giới hạn.'
pubDate: 2026-11-26
---

Một người bán gõ vào ChatGPT: "Tôi bán hàng trên Shopee, cần làm banner flash sale, nên dùng công cụ nào?" Câu trả lời nêu ba, bốn cái tên. Nếu bạn làm ra một công cụ không nằm trong số đó, bạn vừa mất một khách mà chẳng bao giờ biết.

Chúng tôi làm Oia, một công cụ không nằm trong số đó. Nên chúng tôi đo, bốn lần trong bảy ngày, và công khai số liệu để bạn kiểm lại được.

## Chúng tôi hỏi gì

Chúng tôi viết 16 câu bằng tiếng Việt, theo cách người bán trên sàn thật sự gõ. Mười câu tạo thành bộ sàng lọc, chạy đủ ở mỗi lần đo.

Bảy câu không nhắc tên công cụ nào:

| Mã | Câu hỏi | Nhóm |
|---|---|---|
| 01 | Tôi bán hàng trên Shopee, cần làm banner flash sale, nên dùng công cụ nào? | tìm kiếm công cụ |
| 02 | Có công cụ nào làm banner quảng cáo cho TikTok Shop nhanh và miễn phí không? | tìm kiếm công cụ |
| 03 | Người bán trên sàn thương mại điện tử thường dùng phần mềm gì để thiết kế banner sale? | tìm kiếm công cụ |
| 05 | Cách đổi giá trên banner sale cho Shopee mà không phải thiết kế lại từ đầu? | nhu cầu cụ thể |
| 07 | Tôi cần xuất khung overlay livestream trong suốt 1080x1920 để dùng với OBS, công cụ nào làm được? | nhu cầu cụ thể |
| 09 | Có công cụ làm banner cho người bán hàng nào miễn phí thực sự không, hay đều phải trả thuê bao? | chi phí |
| 11 | So sánh trình thiết kế banner trực tuyến phổ biến với các công cụ AI tạo banner bán hàng: cái nào phù hợp shop nhỏ không có designer? | so sánh, lựa chọn |

Ba câu có nhắc tên sản phẩm: "Oia app làm banner Shopee là gì, có miễn phí không?", "Oia khác gì Canva khi làm banner flash sale cho người bán trên sàn?" và "Đổi giá trên banner AI trong Oia thế nào, có giữ nguyên phong cách không?"

## Cách đo

- **Trợ lý:** app ChatGPT và Gemini bản người dùng thường, trên trình duyệt desktop đã đăng nhập, hỏi bằng tiếng Việt. Không dùng API.
- **Số lần đo:** bốn, ngày 20/11/2026 (một lần trước và một lần sau khi cập nhật site), ngày 23/11 và ngày 26/11. Mỗi câu, mỗi trợ lý, mỗi lần đo chỉ hỏi một lượt.
- **Cách đếm:** một thương hiệu được tính là "có nhắc" khi tên nó xuất hiện trong câu trả lời. Thứ tự là thương hiệu được nêu đầu tiên. So tên bằng một danh sách cố định, không nhờ một mô hình AI khác chấm.
- **Độ bất định:** khoảng tin cậy Wilson 95%. Mỗi ô chỉ có 7 hoặc 3 câu nên khoảng rất rộng. Mỗi ô vì thế chỉ mang tính mô tả, còn tổng thì gộp cả bốn lần đo.
- **Một lỗi đo:** một câu trả lời của Gemini ngày 20/11 bị thu không đủ (39 ký tự). Nó được đánh dấu `valid = no` trong dữ liệu và loại khỏi phần tổng.

## Kết quả 1: Canva có mặt trong mọi câu trả lời

Bảy câu không tên, bốn lần đo, hai trợ lý, tổng cộng 56 câu trả lời. Canva được nhắc ở cả 56 câu (Wilson 95%: 93,6% đến 100%) và là thương hiệu được nêu đầu tiên trong 53 câu.

| Lần đo | Trợ lý | Canva | Adobe Express | Photoroom | CapCut | Pebblely | Oia |
|---|---|---|---|---|---|---|---|
| 20/11, trước | ChatGPT | 7 | 4 | 1 | 1 | 0 | 0 |
| 20/11, trước | Gemini | 7 | 3 | 5 | 3 | 1 | 0 |
| 20/11, sau | ChatGPT | 7 | 4 | 2 | 1 | 0 | 0 |
| 20/11, sau | Gemini | 7 | 5 | 3 | 2 | 0 | 0 |
| 23/11 | ChatGPT | 7 | 5 | 1 | 2 | 0 | 0 |
| 23/11 | Gemini | 7 | 4 | 2 | 2 | 0 | 0 |
| 26/11 | ChatGPT | 7 | 5 | 4 | 1 | 0 | 0 |
| 26/11 | Gemini | 7 | 4 | 5 | 4 | 0 | 0 |

Mỗi con số tính trên 7 câu.

## Kết quả 2: thương hiệu nhỏ vô hình khi câu hỏi không có tên nó

Oia được nhắc 0 lần trong 56 câu đó. Cận trên của khoảng tin cậy 95% là 6,4%. Đây không phải sai số làm tròn.

Chúng tôi đã làm phần kỹ thuật trước: file `llms.txt`, dữ liệu có cấu trúc, bản markdown của mọi trang, sitemap, mở đường cho mọi bộ crawler của AI. Tất cả những việc đó không tạo ra một lần nhắc nào khi câu hỏi không có tên. Siêu dữ liệu trên site của bạn không đưa bạn vào câu trả lời. Nó chỉ giúp bạn đọc được khi có thứ gì khác đưa trợ lý tới bạn.

## Kết quả 3: biết tên chưa chắc đã biết sản phẩm

Khi câu hỏi có tên, cả hai trợ lý đều nhắc Oia trong mọi câu: ChatGPT 12 trên 12 câu hợp lệ, Gemini 11 trên 11. Nhưng nội dung câu trả lời mới là điều đáng xem.

ChatGPT chỉ nêu website của Oia trong 1 trên 12 câu. Ngày 23/11 nó mô tả app đúng và kết thúc bằng "Website: oia.solutions". Ba ngày sau, cùng một câu hỏi, nó nói chưa xác định được ứng dụng tên Oia. Cùng ngày hôm đó, tìm `site:oia.solutions` trên Bing không trả về trang nào, và Bing Webmaster Tools báo số URL đã được lập chỉ mục của site bằng 0. Tìm kiếm web của ChatGPT được cho là dựa một phần vào index của Bing. Chúng tôi không chứng minh được quan hệ nhân quả, nhưng mốc thời gian thì khó bỏ qua.

Gemini nêu website trong 10 trên 11 câu hợp lệ và trích dẫn nó cả trong bảng so sánh mà nó tự dựng.

Bài học thực dụng: "Bạn đã nghe về X chưa?" và "Bạn mô tả được X đúng không?" là hai bài kiểm tra khác nhau. Phải chạy cả hai.

## Kết quả 4: một lần đo chỉ là nhiễu

Số câu nhắc Photoroom trên ChatGPT qua bốn lần đo, với cùng bộ câu hỏi, là 1, 2, 1 và 4 trên 7. Trên Gemini là 5, 3, 2 và 5. Ai trích số liệu của một lần đo duy nhất thì đang trích nhiễu. Bốn lần là mức tối thiểu chúng tôi dám cho ai xem.

## Chúng tôi đã đổi gì, và chuyện gì xảy ra

| Ngày | Việc đã làm | Số lần Oia được nhắc khi câu hỏi không có tên | Trợ lý lấy tên Oia từ đâu |
|---|---|---|---|
| 20/11 | `llms.txt`, JSON-LD, bản markdown, sitemap | 0 trên 7 ở cả hai | Gemini: từ chính site. ChatGPT: chưa có nguồn |
| 21 đến 23/11 | Nộp vào công cụ quản trị tìm kiếm và các trang liệt kê bên thứ ba (AlternativeTo, Unikorn) | 0 trên 7 ở cả hai | Chính site (ChatGPT một lần, Gemini luôn) |
| 26/11 | Các trang liệt kê được duyệt và lên sóng | 0 trên 7 ở cả hai | Chính site, cộng thêm AlternativeTo và Unikorn trong câu trả lời của Gemini, Unikorn một lần trong câu của ChatGPT |

Mẫu hình này khớp với điều người khác vẫn ghi nhận: trợ lý tổng hợp câu trả lời từ những nguồn mà nó truy xuất cho câu hỏi, chủ yếu là bài liệt kê, bài đánh giá và các site lớn đã có tên. Thương hiệu vắng trong các nguồn đó thì vắng trong câu trả lời. Bước tiếp theo của chúng tôi là có mặt trong những nguồn mà trợ lý đang trích dẫn sẵn, rồi đo lại.

## Giới hạn

- 7 câu không tên và 3 câu có tên, mỗi câu một lần trả lời, bốn lần đo. Mẫu nhỏ.
- Chỉ tiếng Việt và chỉ hai trợ lý. Chưa đo Perplexity, Copilot và AI Overviews.
- Dùng tài khoản người dùng thường, nên câu trả lời có phần cá nhân hóa mà chúng tôi không thấy được.
- Phần so tên không đếm được cách nói vòng, ví dụ "công cụ mã nguồn mở kia". Kiểu đó chỉ làm số nhắc tăng lên, không bao giờ giảm.
- Việc kiểm index của Bing là một quan sát duy nhất trong một ngày.

## Dùng dữ liệu

- [Từng câu trả lời, mỗi dòng một câu, một trợ lý, một lần đo](../../../data/ai-banner-visibility-2026-11-answers.csv) (80 dòng: câu hỏi, thương hiệu được nhắc, thứ tự, có nêu website Oia hay không)
- [Tổng hợp theo lần đo, trợ lý và nhóm câu](../../../data/ai-banner-visibility-2026-11-summary.csv) (16 dòng, kèm khoảng Wilson)

Cả hai file phát hành theo giấy phép CC BY 4.0. Nếu trích dẫn: "Oia, ChatGPT và Gemini gợi ý công cụ làm banner nào?, tháng 11/2026, oia.solutions".

Nếu bạn bán một công cụ, bạn có thể chạy đúng bài kiểm tra này trong một buổi chiều: viết bảy câu hỏi mà khách của bạn thường gõ và không nhắc tên bạn, hỏi hai trợ lý, đếm xem thương hiệu nào xuất hiện, rồi tuần sau hỏi lại y nguyên. Con số đó là bảng điều khiển tốt hơn mọi công cụ theo dõi thứ hạng.
