# Làm lại hình landing và README

Ngày: 2026-11-09. Theo yêu cầu owner: ít hình, đẹp hơn, cho thấy khả năng sản phẩm,
xoá bộ marketing cũ, có các vòng xem ảnh và cải thiện.

## Kết quả và phạm vi

- Thay toàn bộ nội dung bộ 45 file cũ trong `site/assets/` bằng 6 file:
  3 kết quả sinh ảnh, 1 ảnh editor thật, 2 ảnh ghép dẫn xuất.
- Xoá 3 ảnh cũ trong `docs/screenshots/`, thay bằng `overview.png`.
  Hai script ghép cũ được thay bằng `build-marketing.py`.
- Hai hướng hình duy nhất: MORI matcha xanh rừng và FORMA mỹ phẩm hồng nhạt.
  MORI có thêm một bản sửa ưu đãi 20% thành 30%.
- Giữ bề mặt tiếng Anh, định vị seller marketplace, theme tối và màu tím hiện có.
  Không thay template hay asset bên trong ứng dụng, không xoá bằng chứng lịch sử.
- Bỏ gallery nhiều mẫu, video cũ, mô phỏng layer bằng thẻ nghiêng và lớp grain.
  Trang template chuyển thành mục lục bằng chữ, ghi rõ xem mẫu thật trong app.
- Không gán hình sinh mới thành preview template có sẵn. MORI/FORMA là nhãn hư cấu.

## Nguồn hình, không đánh tráo bằng chứng

Ba lần sinh ảnh thật qua Codex đóng kèm, `codex-cli 0.167.0`; lần thứ hai đính kèm
ảnh MORI thứ nhất để sửa ưu đãi. Prompt đầy đủ, thread ID và SHA-256 ở
[`marketing-assets-provenance.json`](marketing-assets-provenance.json).
Không suy đoán tên model ảnh phía sau. Không claim đây là một lượt Oia chạy đủ
research/auto-refine, vì ba ảnh này được gọi trực tiếp qua CLI.

Ảnh editor được chụp từ bản Electron build mới, mở với userData tạm và provider
mock để không chạm dữ liệu người dùng hoặc sinh ảnh thêm. Artwork thật được upload
qua bridge, project có clip đúng 1254×1380, một layer ảnh và một layer ghi chú giao
hàng. Mở Layers, chọn ghi chú, mở Design rồi chụp cửa sổ thật ở 2880×1666.
Đây là canvas thật chứa ảnh nhập vào, không phải bằng chứng lettering trong ảnh
đã là text layer. Caption ở landing và README ghi rõ điều này.

## Các vòng đánh giá và sửa

### Vòng 1: chất lượng hình và bố cục hero

Xem trực tiếp ba ảnh nguồn, rồi xem screenshot Chrome khi đặt vào trang.
MORI có headline lớn, màu đồng bộ, ảnh sản phẩm rõ; FORMA tạo tương phản bằng
màu và bố cục khác. Bản repaint sửa đúng ưu đãi nhưng có thay đổi nhỏ về texture,
vì vậy bỏ cách diễn đạt khẳng định nguyên từng pixel.

Review độc lập bằng công cụ vision trên screenshot Chrome tìm ra:

- Hero quá cao, cụm thử sửa ưu đãi rơi xuống dưới viewport.
- Cột chữ bắt đầu thấp hơn ảnh, khoảng trống phía trên không có dụng ý.
- Brief và lệnh sửa bị chia thành các mảnh rời.
- Nhãn nhỏ chưa đủ rõ, chip ưu đãi không liên hệ màu với artwork.

Đã sửa: thu artwork về 440px trên desktop, căn hai cột theo mép trên, gộp brief và
lệnh vào một khung, dùng chip màu kem, bỏ pill phụ và thông tin hệ điều hành lặp.
Không crop hay phủ màu lên artwork để ép vào khung.

### Vòng 2: bằng chứng editor và so sánh

Ảnh editor đầu có canvas mặc định quá dài và nhiều vùng trống. Chụp lại với clip
đúng kích thước, mở Layers và chọn text ghi chú để hiện inspector thật. Không sửa
runtime hay renderer để dựng một giao diện marketing khác với sản phẩm.

Kiểm tra so sánh cho thấy thanh chia giữa ảnh che mất khác biệt: hai badge ưu đãi
đều nằm ở bên trái mỗi artwork. Thay bằng hai ảnh nguyên vẹn đặt cạnh nhau.
Bỏ hiệu ứng gõ chữ và tự đổi ảnh: brief cần đọc được ngay và phải khớp lựa chọn.
Nút 20%/30% vẫn hoạt động, cập nhật cả ảnh, `aria-pressed` và brief.

### Vòng 3: viewport thật và kiểm tra cuối

Xem trực tiếp screenshot Chrome cuối ở 1440×900 và 390×844, gồm hero, editor,
FORMA và so sánh. Xem ảnh README ở đúng bề ngang 830px, không chỉ ảnh nguồn lớn.

Review vision độc lập lần cuối trên hero 1440×900 kết luận không còn blocker
trực quan nghiêm trọng: ảnh không cắt chữ, nút và demo nằm trọn viewport.
Khoảng trắng dưới CTA bên trái vẫn lớn hơn bên phải, giữ có chủ đích để chỉ có
một điểm nhấn hình ảnh, không bù bằng thêm card, icon hoặc số liệu giả.
Một yêu cầu review riêng cho tấm QA README bị timeout, không tính thành review
đã hoàn thành; phần README được người thực hiện xem trực tiếp ở 830px.

| Điểm đối chiếu | Kết quả cuối |
| --- | --- |
| Lettering và chủ thể | MORI/FORMA giữ nguyên toàn bộ artwork, không crop headline, sản phẩm hay badge |
| Màu và lớp phủ | Giữ xanh rừng/kem và hồng/burgundy; không tint ảnh theo màu tím của site |
| Nhịp chữ | Headline trong ảnh vẫn đọc được ở cỡ xuất hiện thật, thay vì dùng nhiều thumbnail |
| Khung và khoảng cách | Bỏ khung app giả, dùng screenshot thật; brief/lệnh là một nhóm |
| Mobile | Không tràn ngang ở 390px; editor và so sánh có link mở đủ kích thước |
| Copy và bằng chứng | Phân biệt ảnh baked/native text, ví dụ sinh mới/template có sẵn, giữ style/giữ pixel |
| Nội dung hero | Giữ H1 và CTA; chủ động rút subcopy, bỏ pill và thông tin lặp; không thêm eyebrow |

Không claim độ trung thành với một concept được owner duyệt: không có vòng duyệt
concept riêng. Đối chiếu visual dùng chính ba ảnh nguồn đã chọn và trang render.

## Kiểm tra đã chạy

- `python3 config/audit/marketing-assets.py --self-test`: 3 test xanh, có trường hợp
  xoá ảnh ở nested page, social card và README, cùng kiểm tra URL có khoảng trắng.
- `python3 config/audit/marketing-assets.py`: **28 local media references**, không
  đường dẫn ảnh thiếu, gồm trang template nhiều tầng và ảnh social.
- `python3 site/templates/build.py`: sinh lại đủ 11 trang category/style/pack.
  Sửa đường dẫn tài nguyên và điều hướng ở trang sâu thêm một tầng.
- `python3 docs/screenshots/build-marketing.py`: sinh 3 ảnh dẫn xuất, không network,
  dùng font WOFF2 có sẵn trong repo, không phụ thuộc font trong `/tmp`.
- `node --check site/main.js`, `git diff --check`: xanh.
- `pnpm --filter @oia/desktop exec electron-vite build`: xanh, trước khi chụp editor.
- `pnpm --filter @oia/desktop typecheck`: xanh.
- Chrome thật qua `bsk`: 1440×900 và 390×844 không overflow hoặc ảnh lỗi; chọn 30%
  chuyển ảnh và brief thành `matcha campaign, 30% off`, quay 20% trả đúng trạng thái.
  Link full-size của studio và so sánh trỏ đúng file; nhãn download có tên hệ điều hành.
- Thêm media-reference gate trước bước deploy GitHub Pages; CI chưa chạy từ local.

Một origin localhost cũ trả main.js từ cache cũ, khiến kết quả tương tác ban đầu
không hợp lệ. Dùng origin mới rồi chạy lại toàn bộ kiểm tra; kết quả bên trên là
lượt chạy mới. Full-page capture của bsk bị chặn vì tab đang ở nền; đã chụp và xem
các viewport theo từng section, không claim có screenshot full-page thành công.

Không chạy toàn bộ test/smoke/crash-smoke, không thay code desktop, không kiểm
Windows thật và không deploy production trong phiên này. Thay đổi không đóng
các gate phát hành vốn còn treo trong kế hoạch desktop-only.
