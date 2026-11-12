---
title: 'Khung livestream: giữ giá ở chỗ nút bấm không che được'
description: 'Khung trong suốt 1080x1920 đặt giá và nhãn freeship ở vị trí nút bấm, bình luận của TikTok không che được. Cách mẫu hoạt động và giới hạn thật của vùng an toàn.'
pubDate: 2026-11-12
---

Bạn chuẩn bị đủ hết, đèn đẹp, ưu đãi hay nhất dán ngay giữa màn hình, cũng chính là chỗ nền tảng vẽ các nút của họ. Trên live dọc, giao diện ăn khá nhiều màn hình: dải bình luận bên trái, tim bên phải, hàng chia sẻ và giỏ hàng sát đáy. Người bán giải quyết việc này bằng overlay: một ảnh nền trong suốt mà phần mềm phát trực tiếp ghè lên trên hình, với ưu đãi đặt ở chỗ giao diện để yên.

## Overlay thực chất là gì

Không có gì cao siêu: một file PNG nền trong suốt cỡ 1080 x 1920. Bạn thêm nó như một nguồn trong OBS hay công cụ phát stream đang dùng, nó nằm đè lên hình camera. Vì là ảnh, nó hoạt động như nhau trên TikTok Live, Shopee Live hay nền tảng nào khác; không có gì bị cài vào app cả.

Oia có sẵn năm overlay như vậy: ba mẫu dọc (thẻ giá flash sale, nhãn freeship, khung đếm ngược) và hai mẫu ngang để giới thiệu người dẫn và ưu đãi góc màn hình. Chúng mở ra như cảnh thiết kế bình thường, nên chữ trên đó là lớp bạn gõ lại được, không phải nét vẽ. Khi giá giảm giữa buổi live, điều này quan trọng: đổi số, xuất lại PNG, không cần tạo ảnh AI.

<img src="../../../assets/livestream-example.webp" alt="Bố cục livestream minh họa theo chiều dọc: mẫu thẻ giá trong suốt thật ghép trên ảnh sản phẩm" width="900" height="1120" loading="lazy">

## Vùng an toàn, nói thẳng

Editor vẽ sẵn đường hướng dẫn đánh dấu chỗ giao diện nền tảng thường chiếm, để bạn đặt giá tránh các dải đó. Kèm theo là hai lưu ý trung thực: các vùng này do cộng đồng đo, không phải thông số chính thức từ TikTok hay Shopee, và nền tảng vẫn dịch nút khi cập nhật. Đường hướng dẫn chỉ nằm trong editor, không bao giờ lọt vào PNG xuất ra, nhưng bạn vẫn nên chạy thử một lần: mở stream riêng, nhìn giao diện thật đang nằm ở đâu trên phiên bản app hiện tại, rồi chỉnh lại.

Cũng nên biết: mẫu đếm ngược là khung tĩnh, không phải đồng hồ chạy. Nó nói "kết thúc tối nay" rất tốt; nó không tự đếm giây thật.

## Quy trình từ đầu đến cuối

1. Mở Templates trong Oia, chọn mẫu livestream khớp với ưu đãi.
2. Gõ lại giá, chữ nhãn, câu đếm ngược. Miễn phí, không cần AI.
3. Theo dõi vùng an toàn, giữ chữ tránh các dải gạch chéo.
4. Xuất PNG trong suốt, thêm làm nguồn ảnh trong công cụ phát stream.
5. Chạy thử trên stream riêng một lần trước buổi thật.

Toàn bộ quy trình xem ở [trang khung livestream](../../use-cases/livestream-overlays/). Nếu bạn còn cần ảnh bìa cho buổi live hoặc banner feed đi kèm, [thư viện prompt](../../prompts/) có sẵn các prompt đã kiểm chứng.
