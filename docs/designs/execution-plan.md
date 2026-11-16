---
type: "Plan"
title: "Kế hoạch thực thi tổng hợp: mọi việc phải làm từ nghiên cứu 11/2026"
status: proposed
generated: { by: agent, at: 2026-11-13T00:00:00Z }
---

# Kế hoạch thực thi tổng hợp

## Nguồn tổng hợp

Tất cả nghiệp vụ dưới đây rút từ các doc đã có, không phát sinh yêu cầu mới trong file này:

- [seller-workflow-blueprint.md](seller-workflow-blueprint.md): hồ sơ sản phẩm, bộ ảnh theo role, chiến dịch, xuất manifest, bảo vệ product asset.
- [product-data-entry-research.md](product-data-entry-research.md): sáu cửa nhập liệu (owner duyệt làm cả cửa 6 URL).
- [user-problems-backlog.md](user-problems-backlog.md): mục 1-11, trong đó mục 10-11 owner duyệt PHẢI LÀM.
- [seller-workflow-direction.md](seller-workflow-direction.md): slices S0-S5 và điều kiện dừng.
- [china-ecommerce-workflows-research.md](china-ecommerce-workflows-research.md), [open-design-research riêng tư](../private/open-design-research/README.md): bài học đối thủ.
- [surgepix-parity-todo.md](surgepix-parity-todo.md): nợ còn mở SG-1, SG-12 đến SG-16.

## Nguyên tắc thực thi (không lặp lại từng việc)

1. Không lấy khảo sát/phỏng vấn/tuyển user làm dependency cho bất kỳ việc nào.
2. Mỗi việc có gate nghiệm thu ghi sẵn; việc user-facing kèm shot gate và ít nhất một real-data run theo rule owner 2026-11-10.
3. Không phát sinh chi phí (signing, license, quota thật) khi chưa có xác nhận owner trong việc đó.
4. Lỗi phát hiện ra phải có regression test tái hiện đúng failure mode.
5. Không mở web/mobile (D1), không thêm UI string ngoài tiếng Anh (D8), không đổi mặc định poster (D16), không tự khôi phục BYOK UI (D18).
6. Renderer giữ hoàn toàn offline theo D15: mọi network mới (fetch URL cửa 6, tải ảnh theo link trong file Mass Upload, MCP HTTP) chạy ở utility hoặc main process, renderer không thêm origin mạng nào.

## Bảng tổng quan

| Nhóm | Việc | Phụ thuộc | Trạng thái nền |
| --- | --- | --- | --- |
| Pha 0 | W0.1 Ma trận trạng thái/giấy phép thành phần | Không | Mới |
| Pha 0 | W0.2 Benchmark luồng mẫu trên profile sạch | Không | Mới |
| Pha 0 | W0.3 Sửa ma sát tái hiện từ W0.2 | W0.2 | Mới |
| Pha 1 | W1.1 Schema + store hồ sơ sản phẩm | W0 xong | Xong 16/11 (schema + store + Products view; xem ghi trạng thái cuối file) |
| Pha 1 | W1.2 Màn assisted fill (cửa 2+3+6) | W1.1 | Mới |
| Pha 1 | W1.3 Parser file Mass Upload sàn (cửa 1) | W1.1 | Mới |
| Pha 1 | W1.4 Chính sách product asset 3 lớp + gate hash | W1.1 | Nền: layers.ts có lock |
| Pha 2 | W2.1 Role + layout binding theo ID lớp | W1.1 | Nền: pages.ts có duplicate |
| Pha 2 | W2.2 Bảng duyệt bộ + role rail | W2.1 | Mới |
| Pha 2 | W2.3 Sinh bộ nháp 0-AI | W2.1 | Nền: templates có sẵn |
| Pha 2 | W2.4 Nền AI từng role, validate-first | W2.3, W1.4 | Nền: designer.ts có sẵn |
| Pha 2 | W2.5 Benchmark bộ ảnh đa ảnh thật (gộp SG-6) | Không | SG-6 mở |
| Pha 3 | W3.1 Chiến dịch: duplicate + diff + khóa | W1.1 | Mới |
| Pha 3 | W3.2 Xuất manifest deterministic + naming | W2.1 | Nền: planExport có sẵn |
| Pha 3 | W3.3 Xuất lại bản gốc sau sale | W3.1 | Mới |
| Pha 3 | W3.4 Preset lịch sale VN có nguồn | W3.1 | Mới |
| Pha 3 | W3.5 Gói A/B một trục | W2.x, W3.2 | Mới |
| Pha 4 | W4.1 Lô nhỏ 3-5 dòng trong app | W2.x ổn | Mới |
| Pha 4 | W4.2 MCP server trên loopback + skill | W1.1; bộ ảnh cần W2.3/W3.2 | Nền: loopback + discovery |
| Pha 4 | W4.3 Bảng tham chiếu đối thủ (mục 10) | W1.2 (cửa 6), W2.1 | Owner duyệt làm |
| Pha 4 | W4.4 Variant pass chống trùng (mục 11) | W1.4, W2.4 | Owner duyệt làm |
| Pha 4 | W4.5 Watermark pass hàng loạt | W2.1, W3.2 | Mới |
| Pha 4 | W4.6 Destination checks khi xuất (ưu tiên CAO, làm cùng W3.2) | W3.2 | Mới |
| Pha 4 | W4.7 Role ảnh bìa video | W2.1 | Mới |
| Pha 4 | W4.8 Wire image-translate thành tool thật | W1.x | Skill đã có |
| Pha 4 | W4.9 Nhập gói NCC CSV + ZIP ảnh (cửa 4) | W4.1 | Mới |
| Pha 4 | W4.10 Xuất file chỉnh sửa được (PPTX/SVG) cho Canva | W2.3, W3.2 | Owner duyệt 16/11 |
| Song song | P.1 Verdict quyền Lens + thay/xin phép | Không | SG-16, chặn thu phí |
| Song song | P.2 Ký số + notarization | Owner duyệt chi phí | SG-12 |
| Song song | P.3 Auto-update | Sau P.2 | SG-13 |
| Song song | P.4 Đo & giảm installer | Không | SG-14 |
| Song song | P.5 Windows máy vật lý (gộp SG-1/SG-2/ảnh) | Có máy | D3 |
| Song song | P.6 Shot gate dialog Split layer + verdict SAM license | Không | SG-1 còn 2 mục |
| Song song | P.7 Nợ site SG-15 | Không | Thấp |

Đã xong không lặp lại: packaged-smoke userData tạm (SG-2), PPT Translator (SG-7), Crop (SG-8), Remove background nút (SG-9), sidecar Split layer (SG-1 phần engine).

## Pha 0: chạy thật trước khi xây thêm

### W0.1 Ma trận trạng thái và giấy phép thành phần

Gồm: mỗi thành phần ship (codex pin, Lens, SAM downloader, textdet, rembg ngoài, phông kèm) ghi nguồn, license, quyền thương mại, kích thước, có bắt buộc không. Kết luận Lens ghi verdict văn bản. Ranh giới với P.1: W0.1 chỉ ghi nhận hiện trạng + verdict giấy phép; P.1 là hành động xử lý (xin phép hoặc thay model), cần owner.

Gate: file ma trận trong docs/reference hoặc docs/private; mọi dòng có URL nguồn; không dòng nào "được coi là ổn".

### W0.2 Benchmark luồng mẫu trên profile sạch

Kịch bản bắt buộc: userData mới tinh (env override đã có từ SG-2, `releaseGate.ts` kiểm chặt), KHÔNG provider/mock rõ, KHÔNG rembg, KHÔNG model tải sẵn. Mở mẫu native, thay ảnh sản phẩm thật (giữ nguyên không tách nền), sửa giá + chữ tiếng Việt dài, đổi preset khổ, xuất PNG/PDF, mở lại file. Kèm kịch bản chiến dịch theo đính chính 13/11/2026: đổi ưu đãi/đợt sale trên banner shop + ảnh phụ offer + overlay livestream, ảnh chính KHÔNG đụng, 0 lượt AI. Ghi từng bước: số click, chỗ kẹt, thông báo khó hiểu, lỗi thật.

Lưu ý để không kết luận sai: theo D16, phần lớn mẫu studio hiện có chữ BAKED trong ảnh; vùng giá native chỉ có ở một số mẫu (menu, overlay). Kịch bản phải chạy CẢ hai loại và ghi rõ loại nào: mục đích là phơi đúng giới hạn hôm nay, không phải ép mẫu baked thành bằng chứng đường 0-AI khả dụng cho mọi mẫu.

Gate: bảng kết quả + file xuất trong docs/private/real-runs; phát hiện nào cũng kèm ảnh/chilog. Đây không phải khảo sát user: người chạy là agent/owner, đo sản phẩm.

### W0.3 Sửa ma sát tái hiện

Chỉ sửa những gì W0.2 tái hiện được (tái lập được lần hai). Không thiết kế lại Home theo blueprint ở bước này.

Gate: mỗi fix kèm regression test hoặc shot; chạy lại kịch bản W0.2 sạch lỗi đã sửa.

## Pha 1: hồ sơ sản phẩm + nhập liệu + bảo vệ tài sản

### W1.1 Schema + store hồ sơ sản phẩm

**Owner quyết 13/11/2026 (thay mô hình trường cấu trúc bên dưới): hồ sơ = Name + Description (văn bản tự do, dán từ listing) + Photos[] (thứ tự có nghĩa) + tags + lock notes.** Giá chỉ là một thông tin trong mô tả, không phải trường bắt buộc; không có category kit theo ngành. Lý do: một form cho mọi ngành hàng; người bán đã có sẵn mô tả listing; nghiên cứu nhanh cho thấy sàn hạn chế giá/chữ khuyến mãi trên ảnh chính (TikTok Shop, nguồn bên thứ ba, chưa đối chiếu Seller Center) và seller Việt chủ yếu đặt ưu đãi chứ không đặt giá lên khung. Quy tắc chống bịa thay cho guardrail theo ngành: mọi dòng chữ trên ảnh phải có trong mô tả hoặc do người dùng gõ, kiểm cục bộ 0 AI. Nếu ảnh có giá, Oia đọc giá bằng quy tắc cục bộ và so với mô tả để báo lệch.

**Owner duyệt 16/11/2026 (sửa quyết định trên sau khi xem Shopee thật):** nguồn của quy tắc chống bịa là **Product facts**, không chỉ mô tả. Facts nạp từ mô tả, từ tài liệu brand/nhà cung cấp (PDF, ảnh) hoặc do người dùng gõ; mỗi fact giữ nguồn (tên thử nghiệm, ngày) để in chú thích nhỏ. Bằng chứng: listing 9 Wishes Hydra Ampule II (Official Store, 2k+ bán) có số liệu trên ảnh ("72 giờ, 145.16%", "451.76%", "8 tầng HA") mà mô tả không có, chúng đến từ tài liệu brand; quy tắc "chỉ mô tả" sẽ chặn đúng ảnh bán hàng tốt nhất.

**Owner quyết 16/11/2026 (sau review thiết kế): BỎ quy tắc chống bịa.** Không còn kiểm "chữ trên ảnh phải có trong facts", không banner chặn xuất. Lý do từ review: so khớp chuỗi cục bộ chặn mọi câu diễn đạt lại (tiêu đề tốt đều là diễn đạt lại), còn kiểm diễn đạt lại cần AI, trái 0 AI; quy tắc thành phức tạp mà không đáng tin. Product facts vẫn giữ: là nguồn nội dung để Oia đề xuất chữ cho từng concept ảnh, mỗi fact giữ nguồn để in chú thích nhỏ khi cần; người dùng sửa chữ tự do và tự chịu trách nhiệm nội dung. Các đoạn trên nói tới quy tắc chống bịa coi như đã thay.

`@oia/schema` thêm productProfile (tên, giá, offer, điểm bán, thuộc tính, ảnh refs, logo, lock notes), store trong `@oia/tasks`, additive optional theo D14. Project liên kết hồ sơ qua id; import/export đi atomic write.

Gate: schema test + store test trên temp dir; migration hai chiều; không đụng wire hiện có.

### W1.2 Màn assisted fill (cửa 2 + 3 + 6)

Một màn, ba nguồn vào: ảnh nhãn (1 vision read theo schema B1), dán text (planner parse), URL (fetch meta/JSON-LD công khai, rào cửa 6: không giả browser, không cookie, rate limit, cache, cảnh báo điều khoản). Mọi trường đổ vào dạng ĐỀ XUẤT: duyệt/sửa, xem vùng nguồn, giá luôn highlight, trường thiếu để trống.

Gate: shot gate màn fill; error-path: URL chặn/timeout, OCR sai dấu (đối chiếu fixture), parse hỏng pha đọc = 0 quota đốt; real-data run 1 read thật theo rule 2026-11-10.

### W1.3 Parser file Mass Upload sàn (cửa 1)

Đọc xlsx/csv seller center (bắt đầu Shopee VN), map cột qua UI xác nhận (không map mù), xem trước từng dòng, chọn dòng tạo hồ sơ. Tải ảnh URL trong file là tùy chọn từng dòng, lỗi mạng không chặn tạo hồ sơ.

Gate: file mẫu thật của seller center (tải từ tài liệu chính thức); fixture cột thiếu/sai kiểu/ký tự Windows; 0 quota.

### W1.4 Chính sách product asset + gate hash

Ba lớp như blueprint: lock notes vào prompt, cấu trúc lệnh AI chỉ nhận vùng ngoài lớp product asset, gate so hash asset nguồn sau mỗi thao tác AI, đổi src không xác nhận = fail + log.

Gate: test xuyên `@oia/services` với provider fake đổi src; cancel/giữ nguyên; 1 lượt nền thật xác nhận tích hợp; không phá preview/apply hiện có.

## Pha 2: bộ ảnh theo role

### W2.1 Role + layout binding

**Owner quyết 13/11/2026 (thay bộ role cố định bên dưới):** bộ ảnh suy ra từ ảnh thật của người bán. Ảnh 1 = Main SẠCH (sản phẩm trên nền sạch, không chữ, không giá, không khung) để không vướng quy định ảnh chính của sàn; mỗi ảnh tiếp theo = ảnh thật + một dòng chọn từ mô tả; khung ưu đãi (sale frame) chỉ xuất hiện trong đợt sale, mặc định trên ảnh 2, đặt lên Main chỉ khi người dùng bật và chỉ cho Shopee. Layout chỉ cần ba khung: main sạch, photo-with-line, sale frame; mỗi layout khai báo cỡ chữ tối thiểu để tự co trước khi cảnh báo. Mockup: hàng "Simplified" trên canvas Oia Seller Workflow Redesign.

**Owner duyệt 16/11/2026 (nới "Main sạch"):** Main có hai lựa chọn: sạch, hoặc **Shop frame** (khung cấp shop làm một lần: tên/logo + tối đa 3 badge lấy từ shop facts, chỉ ở mép ảnh, cảnh báo khi che quá 20%; TikTok Shop mặc định vẫn sạch). Ưu đãi có hai kiểu, đều có ngày hết và tự gỡ: dải khung trên ảnh 2, hoặc một ảnh ưu đãi riêng chèn ở vị trí 2. Giá vẫn không đặt lên ảnh. Bằng chứng (quét 16/11/2026, trang tìm kiếm Shopee "serum dưỡng da" và "vòng tay đá nữ" theo bán chạy, 24 ảnh Main): khoảng 5/24 sạch; phần lớn dùng một template cố định cho cả shop (vd TLEE Jewelry: header thương hiệu, cột cam kết S925/bảo hành/đổi trả, ô quà tặng); 1/24 có giá (Estée Lauder); một shop còn để khung "20.10" giữa tháng 11, khớp nhu cầu trạng thái "Sale frame ended". Mẫu nhỏ, nghiêng về shop lớn; là bằng chứng hướng, không phải đo lường.

**Owner duyệt 16/11/2026 (trọng tâm W2):** khung ảnh là hàng phổ thông: Sapo ("Khung ảnh tiếp thị", áp hàng loạt tối đa 50 sản phẩm/chiến dịch, Shopee + TikTok Shop, [nguồn](https://www.sapo.vn/cap-nhat-tinh-nang/cong-cu-khung-anh-tiep-thi)), BigSeller (khung marketing cho ảnh bìa, [nguồn](https://www.bigseller.com/blog/articleDetails/cach-tao-khung-anh-shopee-lazada-tiktok-shop-chuan-dep-ban-chay.372.htm)), cộng tem chương trình Shopee tự gắn. Vì vậy Shop frame chỉ là tùy chọn nhỏ, mặc định Main sạch. Trọng tâm W2 là **ảnh nội dung dựng từ Product facts** (facts card, bảng size, so sánh, thành phần), chạy hàng loạt, giữ nguồn, cộng vòng đời (facts đổi thì sản phẩm về Draft, hết sale thì gỡ ảnh ưu đãi). Giả thuyết, chưa kiểm: shop nhỏ/vừa (local brand, OEM, đại lý nhiều mã) tự làm ảnh nội dung bằng Canva và đây là việc tốn công nhất; cần quét thêm shop dưới 1k lượt bán để xác nhận. Owner 16/11/2026: nhiều shop nhập chung nguồn nên dùng chung ảnh (backlog mục 11); W2.1 vì vậy cũng là cách chống trùng mặc định: ảnh có nhãn `Supplier photo` được giữ packshot, dựng lại bố cục/nền/template riêng của shop, và Oia báo khi ảnh xuất vẫn gần giống ảnh gốc của nhà cung cấp (so khối bố cục/màu, cục bộ, 0 AI).

Mỗi role (main/point/detail/offer/lifestyle tùy chọn) là mục trong schema; layout khai báo slot gắn ID lớp ổn định (không tên hiển thị). Bộ layout khởi đầu: tối thiểu 3 bộ cho 2-3 ngành, làm thật bằng đường sinh ảnh có provenance như quy tắc template-bundle-audit (ảnh thật, không nền màu + chữ giả). Ngành chọn theo mục 13.3-13.4 blueprint (bằng chứng cộng đồng + ảnh sàn thật), owner chốt khi mở việc; mọi layout phải qua checklist tùy biến VN mục 13.2 (giá kiểu VN, phông đủ dấu, từ vựng ưu đãi native).

Gate: serialize/load giữ binding; đổi tên layer không mất binding; schema test.

### W2.2 Bảng duyệt bộ + role rail

Trạng thái từng ảnh: ready/warn (tràn chữ %, thiếu ảnh, thiếu giá). Sửa tại chỗ. Cấm tự cắt chữ để hết warn.

Gate: shot gate; test dữ liệu xóa (tên dài, giá 0, ô trống) hiện đúng warn; không cảnh báo giả.

### W2.3 Sinh bộ nháp 0-AI

Từ hồ sơ + layout tạo N trang, chữ native, ảnh thật chèn layer. Không gọi provider khi mọi role không cần AI.

Gate: chạy profile không provider sinh đủ bộ; 0 lượt metered; text-smoke chữ Việt.

### W2.4 Nền AI từng role + validate-first

Nút AI từng ảnh, giá hiện trước, ảnh AI đầu của bộ phải duyệt mới gợi ý ảnh kế. Kết quả về preview/apply từng lớp, không đụng product asset (W1.4).

Gate:REAL run 1 bộ với 1-2 lượt nền thật; critic read chạy đúng; hủy giữa giữ bản đã có (G3/B7).

### W2.5 Benchmark bộ ảnh đa ảnh thật (gộp SG-6)

10-20 ảnh thật đa loại + ground truth chữ/vị trí; chạy qua deconstruct + bộ mới; số báo cáo kèm khoảng tin cậy.

Gate: harness lặp lại được versioned trong apps/desktop/scripts; không công bố số lẻ một ảnh.

## Pha 3: vòng đời chiến dịch và xuất

### W3.1 Chiến dịch duplicate + diff + khóa bản chốt

Campaign = bản snapshot có tên/ngày; tạo mới từ bản cũ; diff liệt kê ảnh nào đổi; bản chốt read-only.

**Owner quyết 13/11/2026: chiến dịch là "sale event" cấp shop, chứa NHIỀU sản phẩm.** Offer, ngày, quy tắc giá nhập một lần cho cả đợt; giá sale từng sản phẩm vẫn sửa riêng. Mỗi sản phẩm trong đợt vẫn có snapshot read-only riêng khi xuất (giữ lịch sử theo sản phẩm của blueprint 2.3). Giá trị theo ba tầng: hồ sơ (gốc) → sale event (ghi đè) → ảnh đơn (ngoại lệ, luôn hiện trong diff). Mỗi lần xuất tự tạo snapshot. Lý do: preset dịp sale (W3.4) là sự kiện toàn shop, làm theo từng sản phẩm buộc lặp luồng B N lần. Mockup tham chiếu: canvas "Oia Seller Workflow Redesign" màn 6.

Gate: mở lại sau crash không mất; mọi thao tác không đổi bản chốt (so hash scene); test đồng thời hai phiên bản.

### W3.2 Xuất manifest deterministic + naming

Slug + role + khổ; cùng dữ liệu ra cùng tên; manifest json (role, size, hash, campaign, template version).

Gate: xuất hai lần cùng dữ liệu trùng tên/byte hợp lý; ký tự Windows an toàn; zip hàng loạt đúng thứ tự.

### W3.3 Xuất lại bản gốc sau sale

Nút trong chiến dịch: xuất bộ gốc của chiến dịch trước. Không tự đăng sàn.

Gate: bản gốc bất biến qua mọi thao tác của chiến dịch sau.

### W3.4 Preset lịch sale VN

Danh sách dịp (Tết, 2/9, 11/11, 12/12, Black Friday, tựu trường) dạng dữ liệu có nguồn seller center VN + năm kiểm; mỗi dịp checklist vật liệu; chiến dịch sinh từ preset. Theo checklist 13.2 blueprint: không ngày nào không nguồn VN.

Gate: không có ngày nào không nguồn; UI hiện nguồn khi xem.

### W3.5 Gói A/B một trục

Sinh 2-3 bản khác đúng một trục từ chiến dịch; tên file A/B rõ; manifest ghi trục khác biệt.

Gate: các bản thật sự khác trục đã ghi (không trùng nhau); 0 lượt AI khi trục là chữ native.

## Pha 4: mở rộng đã duyệt và nhu cầu

### W4.1 Lô nhỏ 3-5 dòng

Bảng trong app, trường gắn binding W2.1, cùng bảng duyệt; giới hạn lô theo benchmark RAM; checkpoint + resume không rerun.

Gate: như S3 trong direction doc: cancel/restart/tên file đặc biệt/0 AI.

### W4.2 MCP server + skill

HTTP MCP trên loopback hiện có (không mở port mới), tái dụng D9 + discovery + key; tools: upsert_product_profile, list_product_profiles (chỉ cần W1.1), create_image_set, get_set_status, export_set (cần W2.3 và W3.2); skill hướng dẫn như 14 skill hiện có. Có thể ship hai đợt: đợt hồ sơ trước, đợt bộ ảnh sau.

Gate: e2e agent thật qua discovery; security gates D9 chạy trước route; rate limit; không CORS.

### W4.3 Bảng tham chiếu đối thủ (owner)

Cửa 6 vào bảng reference; phân tích vùng bố cục; nút "dùng bố cục với sản phẩm của tôi"; ảnh đối thủ không vào khay xuất.

Gate: provenance mọi mục; test đường chặn/anti-bot fail rõ; export không bao giờ chứa ảnh reference.

### W4.4 Variant pass chống trùng (owner)

Chạy trên bộ ảnh của shop; mỗi bản đổi một trục sáng tạo; đo khác biệt bố cục/màu trước xuất; cảnh báo chính sách cạnh nút; không nhận ảnh lạ, không adversarial.

Gate: đo khác biệt hiện số; từ chối ảnh không thuộc hồ sơ; 1 real run với nền thật; bản xuất nhìn khác nhau bằng mắt.

Owner 16/11/2026: ảnh nhà cung cấp/brand gửi tính là ảnh thuộc hồ sơ (nhãn `Supplier photo`, backlog mục 11). Chống trùng GIỮA CÁC SHOP chung nguồn chuyển lên W2.1 (dựng lại bộ ảnh theo template riêng); W4.4 chỉ còn nhân bản cho các listing của chính shop.

### W4.9 Nhập gói NCC CSV + ZIP ảnh (cửa 4)

Sau khi lô nhỏ W4.1 ổn: nhập CSV + giải nén ảnh vào asset store, map theo cột/tên file, cùng bảng duyệt. Rào bắt buộc đã ghi trong blueprint: giới hạn entry, chống zip bomb, chống path traversal, tên file Windows.

Gate: ZIP độc/nhúng symlink/đường dẫn `../`/tên trùng không sập và không thoát thư mục; 0 quota.


### W4.10 Xuất file chỉnh sửa được cho Canva (owner duyệt 16/11/2026)

Nút "Export editable (PPTX/SVG)" ở màn Export, từng sản phẩm trước, chưa làm lô. Lý do: seller quen Canva; có lối ra giảm nỗi sợ bị khóa trong Oia, Oia lo facts + bộ concept + lô, Canva lo chỉnh tay lần cuối (khớp kết luận "Canva là chuẩn tham chiếu UX, không phải mối đe dọa"). Không dùng Canva Connect API ở bước này (cần OAuth, app, mạng; đi ngược hướng cục bộ), chỉ mở lại khi có nhu cầu lặp lại.

Rào: sản phẩm đã xuất bản chỉnh sửa được bị gắn trạng thái "Edited outside Oia"; lần xuất sau hỏi trước khi ghi đè; kèm `facts.txt` có nguồn để seller tự đối chiếu, vì ra khỏi Oia là mất vòng đời khung sale. Kiểm tái dùng đường PPTX của ppt-translate trước khi viết mới.

Gate: chữ là lớp chữ sửa được (không raster); font tiếng Việt (Be Vietnam Pro) và packshot giữ nguyên; 1 real run nhập file vào Canva thật, ghi lại những gì vỡ (font, hiệu ứng, ảnh tách nền) vào `docs/private/real-runs/`.
### W4.5-W4.8

Watermark pass (0 AI, qua brand kit); destination checks (dữ liệu quy tắc có nguồn/ngày, pass/fail từng ảnh); role ảnh bìa video (khung tĩnh); wire image-translate (giữ chữ native, honest OCR). Gate từng việc theo backlog tương ứng; image-translate cần real-data run như ppt-translate từng làm.

## Rãnh song song: phân phối, pháp lý, nền tảng

- P.1 Lens: owner làm rõ 13/11/2026 đây là tính năng PHỤ. Không còn cửa chặn chiến lược: nếu bản tính phí chưa xong giấy phép thì bỏ Lens khỏi bản đó (deconstruct vẫn chạy không Lens) thay vì chờ xin phép. W0.1 vẫn ghi verdict hiện trạng trong ma trận.
- P.2 Signing: chỉ mua khi owner xác nhận số tiền; sau đó packaged-smoke keychain hiện tượng tự hết (ghi ở SG-2).
- P.3 Auto-update: thiết kế sau P.2, kiểm nguồn/checksum.
- P.4 Installer: đo từng thành phần (codex, lens, sidecar ORT) rồi quyết, không đổi D12 pin để giảm MB.
- P.5 Windows vật lý: chạy packaged-smoke + benchmark W0.2 + font check trên máy thật.
- P.6 SG-1 phần còn lại: shot gate dialog Split layer + verdict Meta SAM License.
- P.7 SG-15 site nợ (asset URL không version, brand sáng, demo GIF, trang SEO VN).

## Thứ tự đề xuất và điều kiện dừng

1. Pha 0 ngay; nếu W0.2 phát hiện blocker nền tảng thì sửa trước, không vào Pha 1. Kèm theo: đo search volume VN cho cụm từ khóa banner/khung ảnh shopee (0 đồng, ghi vào demand-sizing-vn.md làm dữ liệu nền).
2. Pha 1 nguyên vẹn trước Pha 2 (hồ sơ + bảo vệ asset là nền của mọi pha sau).
3. Pha 2 xong bộ nháp + duyệt mới mở Pha 3.3-3.5; Pha 3.1-3.2 có thể làm song song Pha 2 cuối.
4. Pha 4 theo thứ tự: W4.2 (MCP) sớm vì rẻ trên nền loopback; W4.3/W4.4 sau W1.4 + W2.4; còn lại theo nhu cầu.
5. Rãnh song song chạy độc lập, P.1/P.2 chờ owner chi tiêu.

Điều kiện dừng chung của hướng (giữ từ direction doc): nếu benchmark cho thấy lô tự động vẫn phải sửa gần hết từng bản, hoặc ghép lớp nhìn không dùng được, hoặc W0.2 cho thấy đường mẫu gốc đã gãy: dừng, thu hẹp, báo owner, không mở rộng.

## Đỗ lại có chủ đích (không phải bỏ sót, mở lại khi có lý do)

- Backlog mục 7 (trang chi tiết A+ nhiều mô-đun), 8 (review card), 9 (biến thể màu SKU thật): ưu tiên thấp đã ghi, chưa vào pha nào.
- Tổ chức theo "shop" riêng (grouping hồ sơ ngoài project): v1 dùng project + chuyển brand kit, đủ cho freelancer ít shop; mở lại khi dữ liệu thật cho thấy lẫn khách xảy ra.
- Nút Ask AI theo ngữ cảnh ngoài editor (bảng duyệt, bảng duyệt lô): gộp vào W2.2 khi làm UI bảng duyệt; editor đã có AI dock sẵn.
- Cửa 4 đặt sau lô nhỏ đúng như sequence data-entry research.

## Không làm (đã ghi lý do ở doc nguồn)

Đồng bộ tồn kho/giá đa sàn, spy dữ liệu bán/đơn hàng, biến thể adversarial đánh lừa bộ dò, gỡ watermark nguồn người khác, web/mobile, share/collab, gallery cộng đồng, nhận dạng mọi phông làm mũi nhọn.

## Trạng thái khi đóng file

13/11: chỉ tổng hợp kế hoạch, chưa bắt đầu việc nào. Bước tiếp theo lúc đó: W0.1 và W0.2.

Cập nhật 16/11/2026 (sau khi owner lưu canvas redesign làm chuẩn dựng view và chỉ thị bắt đầu làm):

- **W1.1 xong đợt 1**: `@oia/schema` productProfile (đúng mô hình owner 13-16/11: Name + Description tự do + Photos[] có thứ tự + tags + lockNotes + facts giữ nguồn, không trường cấu trúc, không quy tắc chống bịa), ProductStore trong `@oia/tasks` (atomic JSON, test temp dir 7 test), wire IPC preload→main→utility, view Products + trình sửa hồ sơ (đăng ảnh qua uploadAsset, facts gõ tay + bật/tắt kept) theo board SLibrary/SFacts (canvas 16/11). Chỉ hiện trạng suy ra được (All / Needs photos, lọc tag); các nút Make images / Add to sale / Export và trạng thái ảnh chưa có vì W2/W3 chưa làm, không làm giả.
- **Lệch thứ tự có chủ đích, ghi rõ**: Pha 0 (W0.1, W0.2) chưa chạy; owner chỉ thị làm theo canvas sau khi chốt thiết kế, benchmark W0.2 phục vụ việc phơi giới hạn luồng mẫu cũ trước khi thiết kế, giờ thiết kế đã chốt. W0.1 (ma trận giấy phép) vẫn mở, không phụ thuộc việc này.
- Bug bắt được nhờ shot gate: spread đè id trong validate của ProductStore VÀ BrandKitStore (create với `id: undefined` qua structured clone ném lỗi zod); sửa cả hai + regression test. Kèm sửa createdAt của brandkit không còn bị reset mỗi lần lưu.
- Gates: `pnpm build`, `pnpm test` (16 task), `pnpm typecheck`, `pnpm --filter @oia/desktop smoke` (OK), `pnpm --filter @oia/desktop shot` (exit 0, lane products mới: chặn lưu tên rỗng có thông báo, tạo hồ sơ đủ trường, dòng hiện trong bảng, `out/desktop-products.png`).
- **Vòng sửa sau self-review chủ động 16/11 tối (owner yêu cầu mổ sẻ rồi fix hết)**: (1) ProductStore chuyển sang một file một sản phẩm theo pattern ProjectStore (`data/products/<id>.json`, absorb + archive `products.json` legacy, quarantine từng file), một lần save chỉ viết một file nhỏ thay vì cả mảng; đây cũng là lúc trả nợ "migration": absorb legacy có test, migration hai chiều vẫn N/A vì format cũ chưa từng phát hành ngoài dev/shot dir. (2) Bổ sung `products.get` vào wire cho W4.2. (3) Schema siết: trim tên, tags trim + dedupe không phân biệt hoa thường, fact id duy nhất trong hồ sơ (refine), regex http ảnh loại trừ quote/dấu ngoặc; mọi con số limit có ghi lý do trong schema comment (24 ảnh là headroom tự chọn, không phải quy định sàn, sàn thuộc W4.6). (4) Ref ảnh `/api/files/` được probe tồn tại lúc upsert (pathOf, không đọc bytes). (5) Editor: `key` theo id (state không còn rò giữa hai hồ sơ), dirty-guard khi rời màn, một kênh lỗi duy nhất (editor tự giữ lỗi save, list chỉ giữ lỗi tải/xóa), đếm "…" lúc loading, ngày en-GB (D8), datalist tag gợi ý thật, upload ảnh cô lập lỗi từng file + nêu tên file lỗi, ô Photos hiện 0 đỏ thay vì chữ "none" lệch từ vựng, ARIA table đầy đủ cell/columnheader. (6) `list()` của ProductStore và BrandKitStore trả bản copy. (7) Bug dữ liệu thật bắt được khi rà: asset GC roots THIẾU products, ảnh sản phẩm quá grace window sẽ bị quét xóa dù còn tham chiếu; đã thêm root + regression test qua ServiceContext thật. (8) Gate shot products mở rộng: upload 2 ảnh qua IPC thật, đổi thứ tự, badge Main, tắt fact, save, đếm ô, thumbnail oia://, search lọc/xả, selection bar xóa (confirm override, re-query node sau vòng search vì React unmount). (9) Real-data run theo rule 2026-11-10: `apps/desktop/scripts/products-real.mjs` chạy app thật 2 lần boot trên profile thật (OIA_USER_DATA_DIR), nhập listing 9 Wishes thật (claims từ scan 16/11) + ảnh listing thật 1,9 MB qua upload IPC, evidence tại `docs/private/real-runs/2026-11-16-w11-product-profiles/` (local-only theo gitignore); hạn chế ghi rõ trong README: 0 lượt provider (lane 0-AI, W1.2 nợ lượt vision read thật), nội dung mô tả là dựng lại quanh claims thật. Hai bug tự bắt trong lúc fix: editor không tự đóng sau khi save thành công (mất khi tách kênh lỗi), và gate search detach node React làm click mất im lặng.

## Rà soát nhất quán 13/11/2026 (sau khi tổng hợp)

Một lượt rà chéo toàn bộ doc của đợt làm lại này (direction, blueprint, data-entry, backlog, china, open-design, các mục sửa trong reorg/AGENTS/SITEMAP). Phát hiện và đã sửa trong file này hoặc doc tương ứng:

1. **Cửa 4 (ZIP NCC) mất khỏi bảng việc**: research nói "sau lô nhỏ" nhưng Pha 4 không có mục nào. Đã thêm W4.9.
2. **Hai nguồn sự thật cho thực thi**: direction giữ bảng S0-S5, plan giữ W0-W4. Đã ghi rõ execution-plan là nguồn duy nhất, bảng S giữ vai trò lý lẽ.
3. **Renderer offline (D15) vs cửa 6 tải URL**: mọi network mới phải chạy ở utility/main. Đã thêm nguyên tắc 6; không có dòng nào trong docs được hiểu là renderer fetch trực tiếp.
4. **W0.2 có thể kết luận sai vì D16**: phần lớn mẫu hiện có chữ baked, vùng giá native chỉ ở một số mẫu. Đã bắt kịch bản chạy cả hai loại và ghi rõ loại nào.
5. **W4.2 phụ thuộc thiếu**: create_image_set/export_set cần W2.3/W3.2; đã tách ship hai đợt.
6. **Backlog mục 7/8/9 + grouping shop + Ask AI ngữ cảnh** chưa có chỗ đứng: không phải bỏ, là đỗ lại; đã ghi mục riêng để sau này không "phát hiện lại" như-new.
7. **W0.1/P.1 chồng lấn Lens**: đã tách W0.1 ghi nhận/verdict, P.1 hành động xin phép/thay model.
8. Rà D20 (không em/en dash) và không lẫn ký tự TQ trong văn tiếng Việt trên toàn bộ file mới/sửa: sạch.
9. **Đính chính sau rà (owner chỉ ra chiều 13/11/2026):** bảng role blueprint cũ đặt "giá" trên ảnh chính, sai với quy định thật (TikTok Shop cấm giá gây hiểu lầm/không nhất quán trên ảnh; Shopee Mall đòi ảnh chụp thật; watermark Shopee ≤10%). Đã sửa: main sạch không chữ làm mặc định, giá nằm ở ảnh phụ/overlay/social; destination checks (backlog mục 4) tăng ưu tiên CAO, làm cùng W3.2 với luật dạng dữ liệu có nguồn. Để cập nhật bảng W4.6: đổi ưu tiên và phụ thuộc sang W3.2.

Kiểm tra lại sau rà: `git diff --check` sạch; không có thay đổi nào động vào mã sản phẩm trong đợt rà này.

## Rủi ro còn mở sau rà soát 13/11/2026, kèm phản hồi owner cùng ngày

Các mục dưới đây KHÔNG chặn W0.1/W0.2, nhưng chưa có lời giải trong plan và cần owner biết rõ:

1. **Giả định cốt lõi chưa có bằng chứng Việt Nam.** Toàn bộ hướng đứng trên nguồn Trung Quốc/Mỹ, vài bài Reddit và mô phỏng Goldfish. Canva đã có cả brand kit lẫn bulk create; nếu họ gộp hai thứ đó mượt, khoảng khác biệt của Oia còn lại thị trường Việt, bảo toàn sản phẩm và vòng đời chiến dịch. Giảm rủi ro: W0.2 + benchmark bộ ảnh chạy sớm, và khi có người dùng thật thì theo dõi họ có quay lại luồng B hay không (telemetry tự nguyện, không phải khảo sát).

   **Owner phản hồi 13/11/2026:** Canva có thì học; khác biệt là Canva cần Pro (nguồn cộng đồng ghi khoảng 144 USD/năm và vẫn giới hạn bulk export 200 thiết kế/lần, [r/softwaresworthpaying](https://www.reddit.com/r/softwaresworthpaying/comments/1wrc287/canva_pro_in_2026_is_144_a_year_worth_it_for), chưa kiểm chứng độc lập) còn Oia free + local + quota theo ChatGPT của người dùng. Chuyển kết luận: brand kit + bulk create của Canva là CHUẨN THAM CHIẾU UX khi làm W2.1/W4.1 (học cách tổ chức trường, khung xem trước, giới hạn), không phải mối đe dọa phải né. Rủi ro còn lại chỉ là Canva hạ miễn phí phần đó; theo dõi khi làm, không thiết kế phòng thủ sớm.
2. **Phân phối bằng 0.** Plan không có việc nào đưa sản phẩm tới người bán (site debt P.7 là thứ yếu). OpenDesign thắng nhờ kênh (Qianniu, 100k sao). Sản phẩm hoàn hảo không kênh vẫn chết.

   **Owner quyết 13/11/2026: phân phối = SEO, để sau** (sau Pha 0/1). Nền đã có: site tĩnh với trang VI, sitemap, blog (nợ SG-15). Không mở việc phân phối mới trong plan hiện tại; khi mở sẽ là việc SEO cụ thể có trang đích thật.
3. **Giá trị AI phụ thuộc ChatGPT plan của người dùng.** Đường 0-AI không sao, nhưng nền/bối cảnh AI chết với tài khoản free (D17); BYOK UI đã bị rút (D18). Đối thủ bán credit ngay trong app. Nếu Pha 1 cho thấy người dùng mục tiêu không có plan trả phí, cần owner mở lại quyết định phân phối model (BYOK hoặc credit), không để agent tự mở.
4. **Windows chưa kiểm máy vật lý.** Nửa thị trường (OpenDesign: Windows tải gấp đôi macOS) mà mọi gate Windows vẫn treo (D3). W0.2 nên chạy sớm trên Windows thật, không để cuối Pha 2.
5. **Nguy cơ kẹt sâu kiểu D22.** Layout binding, campaign immutable, deterministic export mỗi cái đều có thể thành dự án con dài hạn nếu không ghém nhỏ. Plan cố tình không hẹn ngày; điều đó đổi lấy nguy cơ vàng mạ. Kỷ luật: mỗi W chỉ mở khi W trước đóng gate, benchmark hơn hoàn thiện.
6. **Đường doanh thu đang chặn.** **Owner làm rõ 13/11/2026: Lens là tính năng PHỤ, không phải quan trọng nhất.** Hệ quả: P.1 không còn là cửa chặn chiến lược; nếu bản tính phí chưa xong giấy phép thì đường mặc định là BỎ Lens khỏi bản đó (deconstruct vẫn chạy không Lens) thay vì chờ xin phép. Signing (P.2) vẫn cần owner duyệt chi tiền khi tới lúc.
7. **Nghịch lý D8 vs persona Việt vẫn nguyên.** UI tiếng Anh cho seller Việt là quyết định đã chấp nhận rủi ro; assisted fill và bảng cảnh báo là chỗ nó phơi rõ nhất. W0.2 ghi nhận cụ thể chỗ nào gãy, báo owner, không tự mở lại D8.
8. **Bề mặt mới có rủi ro pháp lý/kỹ thuật:** fetch URL (cửa 6) dù meta-only vẫn có thể bị sàn chặn/không thích; ZIP import là bề mặt bảo mật mới; variant pass (mục 11) dù không adversarial vẫn giúp nhân listing, sàn có thể xem là spam và Oia có rủi ro danh tiếng đi kèm. Đã có cảnh báo trong doc; khi triển khai giữ đúng rào, không nới vì người dùng xin.

Không mục nào trong danh sách này được phép biến thành việc mới tự phát: mỗi cái cần owner nói chuyện trước khi vào plan.
