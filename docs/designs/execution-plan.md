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
| Pha 1 | W1.1 Schema + store hồ sơ sản phẩm | W0 xong | Mới |
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
| Pha 4 | W4.6 Destination checks khi xuất | W3.2 | Mới |
| Pha 4 | W4.7 Role ảnh bìa video | W2.1 | Mới |
| Pha 4 | W4.8 Wire image-translate thành tool thật | W1.x | Skill đã có |
| Pha 4 | W4.9 Nhập gói NCC CSV + ZIP ảnh (cửa 4) | W4.1 | Mới |
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

Kịch bản bắt buộc: userData mới tinh (env override đã có từ SG-2, `releaseGate.ts` kiểm chặt), KHÔNG provider/mock rõ, KHÔNG rembg, KHÔNG model tải sẵn. Mở mẫu native, thay ảnh sản phẩm thật (giữ nguyên không tách nền), sửa giá + chữ tiếng Việt dài, đổi preset khổ, xuất PNG/PDF, mở lại file. Ghi từng bước: số click, chỗ kẹt, thông báo khó hiểu, lỗi thật.

Lưu ý để không kết luận sai: theo D16, phần lớn mẫu studio hiện có chữ BAKED trong ảnh; vùng giá native chỉ có ở một số mẫu (menu, overlay). Kịch bản phải chạy CẢ hai loại và ghi rõ loại nào: mục đích là phơi đúng giới hạn hôm nay, không phải ép mẫu baked thành bằng chứng đường 0-AI khả dụng cho mọi mẫu.

Gate: bảng kết quả + file xuất trong docs/private/real-runs; phát hiện nào cũng kèm ảnh/chilog. Đây không phải khảo sát user: người chạy là agent/owner, đo sản phẩm.

### W0.3 Sửa ma sát tái hiện

Chỉ sửa những gì W0.2 tái hiện được (tái lập được lần hai). Không thiết kế lại Home theo blueprint ở bước này.

Gate: mỗi fix kèm regression test hoặc shot; chạy lại kịch bản W0.2 sạch lỗi đã sửa.

## Pha 1: hồ sơ sản phẩm + nhập liệu + bảo vệ tài sản

### W1.1 Schema + store hồ sơ sản phẩm

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

Mỗi role (main/point/detail/offer/lifestyle tùy chọn) là mục trong schema; layout khai báo slot gắn ID lớp ổn định (không tên hiển thị). Bộ layout khởi đầu: tối thiểu 3 bộ cho 2-3 ngành, làm thật bằng đường sinh ảnh có provenance như quy tắc template-bundle-audit (ảnh thật, không nền màu + chữ giả).

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

Gate: mở lại sau crash không mất; mọi thao tác không đổi bản chốt (so hash scene); test đồng thời hai phiên bản.

### W3.2 Xuất manifest deterministic + naming

Slug + role + khổ; cùng dữ liệu ra cùng tên; manifest json (role, size, hash, campaign, template version).

Gate: xuất hai lần cùng dữ liệu trùng tên/byte hợp lý; ký tự Windows an toàn; zip hàng loạt đúng thứ tự.

### W3.3 Xuất lại bản gốc sau sale

Nút trong chiến dịch: xuất bộ gốc của chiến dịch trước. Không tự đăng sàn.

Gate: bản gốc bất biến qua mọi thao tác của chiến dịch sau.

### W3.4 Preset lịch sale VN

Danh sách dịp (Tết, 2/9, 11/11, 12/12, Black Friday, tựu trường) dạng dữ liệu có nguồn seller center + năm kiểm; mỗi dịp checklist vật liệu; chiến dịch sinh từ preset.

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

### W4.9 Nhập gói NCC CSV + ZIP ảnh (cửa 4)

Sau khi lô nhỏ W4.1 ổn: nhập CSV + giải nén ảnh vào asset store, map theo cột/tên file, cùng bảng duyệt. Rào bắt buộc đã ghi trong blueprint: giới hạn entry, chống zip bomb, chống path traversal, tên file Windows.

Gate: ZIP độc/nhúng symlink/đường dẫn `../`/tên trùng không sập và không thoát thư mục; 0 quota.

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

1. Pha 0 ngay; nếu W0.2 phát hiện blocker nền tảng thì sửa trước, không vào Pha 1.
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

Chỉ tổng hợp kế hoạch, chưa bắt đầu việc nào. Bước tiếp theo cụ thể: W0.1 và W0.2, cả hai không cần duyệt chi phí. `git diff --check` sạch.

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
