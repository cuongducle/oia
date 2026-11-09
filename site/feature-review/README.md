# Bộ hình tính năng để duyệt

> Cập nhật: pack này giữ làm hồ sơ duyệt gốc. Ảnh tham chiếu và livestream đã
> được tích hợp bằng ảnh rời vào landing chính và README, cùng mẫu Make text
> editable mới. Các đoạn “chưa tích hợp” bên dưới mô tả thời điểm dựng pack,
> không phải trạng thái hiện tại. Xem `../../docs/verification/feature-assets.json`
> và `../../docs/verification/marketing-assets.md`. Chưa deploy đợt tích hợp này.

Chạy từ gốc repo:

```bash
python3 site/feature-review/build.py
python3 -m http.server 3847 --bind 127.0.0.1 --directory site
```

Mở `http://127.0.0.1:3847/feature-review/`. Chỉ là bản xem trước, chưa tích hợp vào `site/index.html`, chưa deploy. Trang có `noindex, nofollow`, chưa gắn vào sitemap hay điều hướng landing.

## Giao phẩm

| File trong assets/ | Vai trò |
| --- | --- |
| `01-product-to-campaign.webp` | Ảnh sản phẩm STILL → quảng cáo có dùng ảnh tham chiếu |
| `02-offer-edit.webp` | MORI 20% → 30%, cùng hướng hình ảnh |
| `03-real-layer-editor.webp` | Editor thật, chọn native text layer ghi chú |
| `04-live-safe-zones.webp` | Artboard livestream crop từ screenshot Electron thật |
| `05-art-direction.webp` | MORI và FORMA, hai hướng thiết kế khác nhau |
| `01-product-to-campaign-mobile.webp` | Bố cục dọc cho điện thoại, tránh chữ/ảnh quá nhỏ |
| `02-offer-edit-mobile.webp` | So sánh dọc cho điện thoại |
| `contact-sheet.jpg` | Bảng duyệt nhanh đủ 5 hình chính |

5 hình chính ở 1800×1120; 2 bản dọc ở 900×1680 và 900×2100. Artwork gốc và screenshot nguồn trong `sources/`; ảnh MORI/FORMA/editor dùng nguồn đã có ở `../assets/`. Script chỉ ghép hình, không network hoặc gọi AI. Cần Pillow có FreeType hỗ trợ font WOFF2, như script marketing hiện có của repo.

Có đúng **2 output ảnh AI mới** qua công cụ tích hợp Codex 0.167.0: ảnh túi STILL, sau đó ảnh quảng cáo với túi đó làm tham chiếu. Không phải hai lần Oia chạy đủ planner/research/refine. Prompt, thread ID và mã băm ở `provenance.json`; mã băm hình dẫn xuất ở `asset-manifest.json`. STILL là nhãn hư cấu, ảnh sản phẩm đầu vào cũng do AI tạo. Các hình còn lại tái sử dụng artwork/screenshot đã có, không gọi thêm ảnh.

Audit tính năng và các lời hứa nên tránh: `../../docs/designs/landing-feature-audit.md`.

## Kiểm tra và vòng sửa

- Đã đọc trực tiếp hai ảnh mới: đúng nhãn STILL / SLOW ROAST / 250 g và thông điệp quảng cáo, nhận ra cùng sản phẩm. Bao bì không đồng nhất từng pixel; không có cam kết pixel-lock.
- Xem bảng tổng hợp và ảnh nguồn. Sửa caption hình 01 thành hai dòng để không tràn qua ảnh chiến dịch.
- Chrome thật qua bsk, 1440×1000: xem screenshot bản render, kiểm tra không tràn ngang. Điều hướng từ mục Product to campaign đến đúng hình.
- So nguồn 1800×1120 với screenshot Chrome cuối bằng mắt và vision độc lập, không có blocker về crop, lớp phủ màu hoặc chữ đè. Vision không phải chứng nhận độ trung thực sản phẩm, chỉ là review thị giác.
- Chrome thật 390×844: phiên bản đầu thu nhỏ ảnh quá nhiều, đã thêm hai bản mobile dọc và dùng `picture/source`. Xem screenshot cuối, `currentSrc` chọn đúng cả hai file mobile, cả hai tải thành công và không tràn ngang.
- Năm điểm đối chiếu: toàn bộ headline/bao bì không bị crop; giữ tỷ lệ ảnh; không tint ảnh theo nền tím; font/phân cấp/caption không đè nhau; mũi tên nằm giữa input/output; mobile chuyển sang bố cục dọc. Không dựng lại hay đổi chữ bên trong screenshot UI.
- Không có concept toàn landing đã được owner duyệt. Không claim hoàn tất redesign hoặc độ trung thành với một concept chưa tồn tại. Đây là asset review, ảnh nguồn là chuẩn để kiểm render.
- Copy hiện tại của landing chính không thay đổi. Không thêm headline, eyebrow hoặc CTA vào landing đang chạy.
- `python3 config/audit/marketing-assets.py`: 35 tham chiếu media local, không thiếu file.
- `git diff --check`: xanh. Chưa chạy build/test/smoke desktop vì không đổi code app. Không claim kiểm lại Windows, xuất file hay deconstruct thật trong phiên này.

## Khi đưa lên landing chính

Giữ heading và lời giải thích thành HTML, dùng artwork độc lập thay vì buộc điện thoại thu nhỏ toàn bộ hình có chữ. Không lặp 5 bố cục giống nhau. Giữ caption về nguồn ảnh, chi phí repaint và giới hạn vùng an toàn. Make text editable đáng có demo riêng, nhưng bộ này chưa có kết quả deconstruct trên artwork mới để dùng làm bằng chứng.
