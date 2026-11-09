---
type: "Verification Record"
title: "Marketing assets rework"
description: "2026-11-09 rework: 45 old marketing files replaced by six focused campaign assets (MORI, FORMA), overview.png and the build-marketing.py pipeline."
tags: [verification, marketing, site]
status: stable
generated: { by: human:cuongducle, at: 2026-11-09T00:00:00Z }
---

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

## Phát hành theo yêu cầu owner

Owner yêu cầu deploy toàn bộ và push mọi thay đổi local sau khi bộ hình hoàn tất.

- Đã push lên `origin/main`, gồm hai commit local có sẵn và commit bộ hình
  `c90f720c57597e678001010edc372a87614f5525`.
- Cloudflare deploy thành công, version `e9cad6c4-b906-453f-9041-08bb3abd38fb`.
  Dọn cache Python khỏi cây static trước lượt deploy cuối, không đưa bytecode lên site.
- GitHub Pages deploy xanh: [run 42559638292](https://github.com/cuongducle/oia/actions/runs/42559638292).
  Gate media mới đã chạy trong CI trước khi publish.
- CI bản code deploy xanh: [run 42559638291](https://github.com/cuongducle/oia/actions/runs/42559638291),
  gồm build/test/typecheck, desktop-smoke, desktop-smoke-windows và unit-windows.
  Hai job đóng gói installer được skip đúng trigger, không tạo release desktop mới.
- Mở `https://oia.solutions/` bằng Chrome thật, xem ảnh chụp hero sau deploy.
  Fetch cùng origin trong browser trả HTTP 200 và SHA-256 khớp local cho đủ
  9 file: index, JS, CSS và cả 6 asset marketing. Không cần purge cache.
  HTTP client ngoài browser bị 403, không lấy phản hồi đó làm bằng chứng site lỗi.
- Thư mục làm việc sạch sau push. Commit ghi nhận phát hành này chỉ thay tài liệu.

## Mẫu "Make text editable" thật cho landing (2026-11-09)

- Asset mới: `site/assets/editable-text-sample.webp` (1488×680; bản đầu 68KB,
  bản builder công khai hiện khoảng 81KB), ghép 3 khung:
  poster gốc chữ nung sẵn / bản dựng lại thành layer chữ chỉnh sửa được / bản đã sửa
  ngày + giá. Ghép bằng `make-landing-asset.py`, nguồn pixel là kết quả thật của
  tính năng, không chỉnh tay nội dung.
- Chuỗi chạy thật: tác giả poster bằng phông đầy đủ dấu tiếng Việt (Georgia,
  Be Vietnam Pro, Courier New; bỏ Chalkboard vì thiếu glyph dấu, bỏ glow cong để
  vùng chữ nằm trên gradient tuyến tính tái tạo cục bộ được). Một lượt
  deconstruct thật: 1 lượt đọc + 1 ảnh, ~90 giây. OCR đọc đúng 9/10 dòng kể cả
  "MỚI NẤU", "SỐ LƯỢNG CÓ HẠN"; một dòng đọc "Cửa Hỏa" thành "Cửa Hòa", dấu ₫
  thành đ. Màu khôi phục đúng byte ở 7/8 vùng đo.
- Đính chính sau khi owner chỉ ra chữ dính: bản đầu KHÔNG đạt. Script render
  lại dùng nhầm `test-input-vi.png` thay ảnh poster để khớp phông. Các số đo
  SSIM 0,8867 và 35.882 pixel từng báo không chứng minh bản đó đẹp hay đúng.
- Sửa thật: script trỏ đúng ảnh; refineTextRegions tách dải hàng chữ bằng khoảng
  trống, giới hạn nới ngang để tránh bắt khung trang trí, bỏ hàng mực quá thưa
  để khung dọc không nối hai dòng. Bảng khớp phông bỏ dấu phân cách đứng riêng
  để không tiêu hết ngân sách sáu dòng. Không gán phông/cỡ từ đáp án mẫu.
- Bản cuối đã mở xem trực tiếp: hết chồng tiêu đề và huy hiệu. SSIM toàn ảnh
  0,9500; headline 0,8867, nghiêng 0,8806, thân bài 0,9718, giá 0,9617,
  huy hiệu 0,9652, footer 0,8833. Đây là dải vùng cố định của một ảnh synthetic,
  không phải benchmark nhiều ảnh. OCR sai dấu và khác biệt chữ nhỏ vẫn còn.
- Bản demo đầu cần script nới hộp, owner bác cách làm này và yêu cầu sửa code
  sản phẩm. Bản cuối đã thay bằng `createEditor` thật: harness chỉ nhập nội
  dung qua textarea Fabric và xuất PNG, không set chiều rộng. Editor tự đo và
  nới hộp của dòng khôi phục khi gõ, giữ cỡ/phông/vị trí/góc. Câu mới giữ một
  dòng; Enter tường minh vẫn xuống dòng, textbox thường vẫn wrap. Marker
  `recoveredTextLine` sống qua save/reload/clone. Caption phản ánh tự nới khi gõ.
- Gate Electron shot dùng sự kiện nhập textarea thật, xác nhận câu dài giữ một
  dòng, không đổi cỡ/vị trí, reload/clone, Enter và textbox thường đều đạt.
  `pnpm test`, `pnpm typecheck`, package build, desktop build/shot/smoke và
  crash-smoke đạt. Bản cuối `site/assets/editable-text-sample.webp` đã mở xem
  trực tiếp, không chồng tiêu đề hoặc huy hiệu. Toàn bộ lượt sửa này 0 quota;
  tái dùng OCR/plate cũ, chưa chạy lại nguyên task trả phí hoặc Windows thật.
- Lưu ý trung thực trong caption trang: "Unusual fonts are matched with the
  closest available family". Không quảng cáo khôi phục phông gốc tuyệt đối.
- Chi tiết và bằng chứng từng bước ở
  `docs/private/surgepix-feature-audit-2026-11-09/landing-sample/`
  (gitignored), quyết định kỹ thuật ghi trong sổ D22/D23 của
  `docs/designs/desktop-only-reorg.md`.
- Mẫu này cũng là bằng chứng công khai đầu tiên của D22/D23 trên landing:
  `site/assets/editable-text-sample.webp`, ghép từ pixel thật của một lần chạy
  trả phí, gate `marketing-assets.py` đạt (36 tham chiếu).

## Hoàn thiện bộ feature, landing, README và báo cáo SurgePix

### Giao phẩm

- `site/index.html`: thêm cặp STILL tham chiếu → chiến dịch, tách Make text
  editable thành ba ảnh rời để mobile đọc được, thêm crop livestream có vùng
  an toàn. Giữ hero MORI, cặp repaint, screenshot editor và FORMA đã duyệt.
- `README.md`: đồng bộ ba nhóm minh họa trên, giữ giải thích có phí/không sinh
  ảnh mới. Ghi rõ Split layer còn gate mô hình thật và giấy phép Lens hạn chế
  thương mại. Không dùng PoC làm ảnh quảng cáo kết quả desktop.
- `docs/screenshots/build-feature-assets.py`: tái tạo bảy asset từ nguồn đã có,
  không gọi AI/mạng. Đầu ra và mã băm: `feature-assets.json`. Ba poster rời
  được xuất từ product editor; builder chỉ chuyển định dạng/ghép, không sửa chữ.
- Báo cáo riêng tư `docs/private/surgepix-feature-audit-2026-11-09/REPORT.md`,
  `REPORT.html`, bảy ảnh trong `illustrations/` cùng manifest nguồn/mã băm và
  `build-report.py`. Báo cáo có tám ảnh tổng cộng khi tính thêm mẫu Oia.
- Đính chính báo cáo: typography Extract text lệch rõ trong ảnh xuất, không
  gọi là chất lượng cao; 25 credit không đổi chỉ chứng minh các lượt thử không
  bị trừ, không chứng minh miễn phí vô hạn. Rút khẳng định GPU tự vận hành,
  model cụ thể và giá vốn dưới 0,001 USD vì không có bằng chứng backend.
  So sánh Oia thay trạng thái cũ “luôn Be Vietnam Pro/màu cố định” bằng D22/D23.
- Không chép screenshot, capture hoặc asset SurgePix sang cây site công khai.
  Report dựa trên phiên 09/11 đã lưu, không phải lần khảo sát website mới.

### Kiểm tra

- Chrome thật qua bsk: landing ở 1440×1000 và 390×844, xem ảnh render trực tiếp.
  Mobile cặp tham chiếu và ba poster thành một cột 350px, không tràn ngang.
  Sau cuộn qua các section, 0 ảnh lỗi. Link livestream mở đúng use-case và
  title, console không có thông báo lỗi trong buffer kiểm tra.
- README dựng bản xem trước rộng 830px, ảnh so sánh và chữ không đè nhau,
  không ảnh lỗi/tràn ngang. Đây là preview local, không phải GitHub live.
- Report HTML ở 390px: tám ảnh tải đủ, năm bảng có vùng cuộn riêng, không
  overflow trang. Screenshot mobile đã xem. Lần chụp report desktop cuối bị
  bsk timeout, không ghi là đã qua. Chụp full-page cũng bị từ chối do tab nền,
  vì vậy bằng chứng landing là ảnh viewport, không phải full-page.
- Đã sửa nội dung landing bị giấu trong tab nền do reveal animation; nội dung
  hiển thị tĩnh ngay cả khi observer chưa chạy, thêm scroll margin cho anchor.
- Builder công khai và report đều chạy được; ba self-test media và 45 tham
  chiếu ảnh local đạt. Mười link/ảnh tương đối trong report HTML tồn tại.
  Cú pháp Python, quét dấu gạch ngang dài trong copy mới và diff check đạt.
- Không sửa code desktop trong đợt tích hợp media/docs này. Gates app của
  đợt sửa editor trước không bị nhận thành chạy lại. Không thêm quota, chưa
  push/deploy, chưa kiểm Windows thật hoặc chạy lại task trả phí.

## Triển khai toàn bộ: Cloudflare + release desktop v0.5.0 (2026-11-10)

### Cloudflare (oia.solutions)

- `wrangler deploy` từ gốc repo, version `aaae3ff3-737d-40b4-9eca-09de075d62ab`
  (29 file mới + 39 file cũ). Sau đó deploy lại lần hai `ff4d718c-e121-4b91-9cbe-755aab8ab1fc`
  cho fallback text v0.5.0.
- Kiểm chứng same-origin bằng Chrome thật (fetch cache:no-store + SHA-256):
  10/10 file khớp từng byte với local (index, styles.css, main.js và 7 asset mới).
  Ảnh ban đầu báo "broken" (`mori-comparison.webp`) chỉ là lazy-load chưa kéo;
  sau scroll + decode: 0 ảnh lỗi. Không overflow ngang ở viewport 1193px.
- Console buffer không có lỗi trong phiên kiểm.

### Release desktop v0.5.0

- Quy trình: commit fix CI (dist job thiếu bước sinh `resources/lens`), bump
  version, tag `v0.5.0`, CI xanh cả hai job đóng gói (mac arm64 + win x64),
  tải artifact, đối chiếu SHA-256 khớp CI, publish release kèm notes +
  checksums: https://github.com/cuongducle/oia/releases/tag/v0.5.0
- Lần tag đầu thất bại đúng một job `desktop-dist-mac` vì python Homebrew trên
  runner chặn pip (PEP 668). Sửa bằng venv trong workspace, re-tag cùng tên;
  không rerun SHA cũ.
- Kiểm cấu trúc dmg thật (mount read-only): `Resources/lens` đủ 4 file,
  cặp codex pinned, `app.asar.unpacked/node_modules` có `onnxruntime-node`,
  `canvas`, `@napi-rs`. App đóng gói đã boot được trên profile thật
  (utility up, loopback API, ctx ready) trước khi bị dừng.
- Sự cố cần biết: lần boot đó vô tình dùng userData THẬT của owner (app đóng
  gói không có cơ chế test-mode dir như `electron .`). Asset GC chạy và dọn
  2/32 upload mồ côi quá 7 ngày, đúng chính sách mọi lần mở app; các store
  (projects, chat-sessions, task-log) không đổi theo mtime. Không lặp lại;
  scripted packaged-smoke (dir tạm) vẫn là nợ.
- Fallback text tải về trên site đổi sang v0.5.0 (~395 MB), audit media vẫn
  45 tham chiếu.
- v0.4.1 vẫn là draft release (đã có artifact từ trước); không xuất bản hay
  xóa, chờ owner quyết.

### Giới hạn công bố

- Không có smoke script trên bản đóng gói (dmg/exe) với thư mục dữ liệu tạm;
  bằng chứng mac là cấu trúc + boot trên profile thật, Windows là CI runner.
- Chưa kiểm Windows máy vật lý của người dùng; chưa chạy model SAM 880 MB
  end-to-end trong app đóng gói; Lens vẫn hạn chế phi thương mại (NOTICE kèm
  trong app và ghi trong release notes).
