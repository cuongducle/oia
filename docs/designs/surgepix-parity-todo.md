---
title: "SurgePix parity TODO: những gì còn thiếu hoặc chưa hoàn thiện"
generated: { by: agent, at: 2026-11-10T00:00:00Z }
status: draft
owner: cuongducle
source-of-truth: docs/private/surgepix-feature-audit-2026-11-09/REPORT.md
---

# SurgePix parity TODO

Mục đích: danh mục việc còn thiếu hoặc chưa hoàn thiện của Oia so với những gì
đã quan sát thấy ở SurgePix (phiên kiểm 09/11/2026). Mỗi mục có tham chiếu code,
bằng chứng và gate nghiệm thu để nhặt lên code tiếp được ngay.

Quy tắc dùng doc này:

- Hoàn thành mục nào thì đánh dấu `DONE` kèm commit + gate đã chạy, không xóa mục.
- Mục loại "cần owner quyết" không tự mở rộng scope.
- Bằng chứng đối thủ nằm trong `docs/private/` (gitignored), không copy sang site.
- Tuân thủ D20: không em dash, không en dash trong mọi văn bản mới.

## Nguồn và mức bằng chứng

| Nguồn | Nội dung |
| --- | --- |
| `docs/private/surgepix-feature-audit-2026-11-09/REPORT.md` mục 2 | Bản đồ bề mặt SurgePix đã thấy: Home, Workspace, Editor (Crop, Remove Background, Extract text, Inpainting, More: Split layer), Brand kit, Toolbox (Presentation, Image Creator, Background Remover, Image/PPT Translator), For Agents |
| Cùng doc mục 3, 5 | Extract text của SurgePix: Textbox thật nhưng typography lệch, sai dấu tiếng Việt, từng mất vùng "SALE 50%" |
| Cùng doc mục 4 | Split layer của SurgePix: poster phẳng trả nguyên input, nền có thể còn bản sao chủ thể |
| `docs/designs/desktop-only-reorg.md` D16 đến D23 | Quyết định và trạng thái các lane tương ứng bên Oia |
| `docs/verification/feature-assets.json`, `docs/verification/marketing-assets.md` | Giới hạn quảng cáo hiện tại và lý do |

Lưu ý trung thực: audit không chạy thử toàn bộ tool của SurgePix, bảng so sánh
chỉ gồm những gì đã thấy. Mục nào chưa kiểm thì ghi rõ.

## Bảng tổng quan

| ID | Việc | Nhóm | Size | Ưu tiên |
| --- | --- | --- | --- | --- |
| SG-1 | Split layer: chạy e2e model thật trong app đóng gói + shot gate dialog + đọc Meta SAM License | Chưa hoàn thiện | M | Cao |
| SG-2 | Packaged smoke: override userData cho app đóng gói, không chạm profile thật | Hoàn thành | S | Cao |
| SG-3 | Mở rộng ứng viên khớp phông (classifier OFL hoặc catalog lớn hơn) | Chưa hoàn thiện | L | Trung bình |
| SG-4 | OCR dấu tiếng Việt: crop re-read hai bước (đã có bằng chứng nguyên lý) | Chưa hoàn thiện | S | Trung bình |
| SG-5 | Nền phức tạp sau tách chữ: nghiên cứu inpaint local 0 quota | Chưa hoàn thiện | M | Trung bình |
| SG-6 | Benchmark chất lượng đa ảnh cho D22/D23 | Chưa hoàn thiện | M | Cao |
| SG-7 | Wire PPT Translator vào UI tools (skill đã có) | Hoàn thành | S | Cao |
| SG-8 | Crop ảnh trong editor toolbar | Thiếu | S | Trung bình |
| SG-9 | Nút Remove background trên ContextToolbar ảnh | Hoàn thành | S | Trung bình |
| SG-10 | Draw tool: layer vẽ tay | Thiếu | M | Thấp |
| SG-11 | Table trong editor | Thiếu | M | Thấp |
| SG-12 | Code signing + notarization | Phân phối | M | Cao |
| SG-13 | Auto-update | Phân phối | M | Sau SG-12 |
| SG-14 | Giảm kích thước installer ~395 MB (codex 166 MB + lens 45 MB) | Phân phối | M | Trung bình |
| SG-15 | Nợ D19 của site (asset URL không version, brand sáng, trang SEO VN, demo GIF) | Phân phối | S | Thấp |
| SG-16 | Lens license thương mại: xin phép hoặc thay model | Cần owner quyết | M | Trước khi tính phí |
| SG-17 | Share/collaborate web | Cần owner quyết | L | Chưa mở |
| SG-18 | Gallery cộng đồng | Cần owner quyết | L | Chưa mở |

---

## A. Chưa hoàn thiện: code có, gate còn mở

### SG-1. Split layer đóng đủ gate để quảng cáo bằng output app

Khoảng trống: landing hiện chỉ dán nhãn preview, không dám dùng output app làm
bằng chứng. Nợ ghi tại D21: (2) e2e model thật, (3) Meta SAM License, (4)
Windows máy vật lý, (5) shot gate dialog.

Tham chiếu code:

- `apps/desktop/src/utility/segmentation/engine.ts`, `models.ts`, `compose.ts`, `clip-bpe.ts`: engine ONNX, download checksum-pinned vào `<userData>/models/sam3`.
- `apps/desktop/src/main/index.ts`: IPC `segment:status`, `segment:download` (poll-based, không thêm event wire).
- `apps/desktop/src/renderer/components/ContextToolbar.tsx`: nút `data-testid="ctx-split-layer"`.
- `packages/tasks/src/processors.ts`: task `segment-image`, schema enum trong `packages/schema/src/segment.ts`, `packages/schema/src/task.ts`.
- Test hiện có: `apps/desktop/test/segment-bpe.test.ts`, `segment-compose.test.ts`, `packages/tasks/test/segment.test.ts`.
- PoC chọn model: `docs/private/surgepix-feature-audit-2026-11-09/poc-local-segment/RESULTS.md` (IoU 0,994 vs PyTorch BF16, bảng 6 bản ONNX).

Việc cần làm:

1. Chạy một lượt thật trên máy owner: mở app đóng gói v0.5.0, bấm Split layer,
   đồng ý download 880 MB, prompt "ly cà phê", nhận cutout layer. Ghi lại thời
   gian download, thời gian vision encode, thời gian mỗi prompt.
2. Shot gate cho dialog Split layer (prompt + chips + trạng thái download +
   progress + lỗi checksum), theo mẫu shot gate hiện có trong
   `apps/desktop/src/main/index.ts` (xem gate typing recovered text).
3. Đọc và ghi verdict Meta SAM License (model SAM 3 và bản convert
   danilobukvic/sam3-text-onnx) vào một file riêng trong `docs/private/`, kết
   luận: được phép phân phối downloader hay cần điều khoản thêm.
4. Windows máy vật lý (gộp chung SG chung Windows ở cuối doc).

Gate nghiệm thu: e2e thật 1 ảnh + 1 prompt pass trên macOS đóng gói, shot gate
vào CI xanh, verdict license có văn bản. Sau đó mới đổi caption landing từ
preview sang output thật (đồng thời cập nhật `docs/verification/feature-assets.json`).

### SG-2. Packaged smoke với userData tạm — DONE (commit b0c9588, gates: release-hardening 14 test mới, desktop 227, turbo build/test/typecheck, smoke, crash-smoke, `pnpm packaged-smoke` 3/3 trên dist/mac-arm64/Oia.app đóng gói đầy đủ fuse)

Khoảng trống: app đóng gói không có cơ chế test-mode dir như `electron .`. Lần
boot nhầm 11/2026 đã để asset GC chạy trên profile thật (dọn 2/32 upload mồ côi,
đúng chính sách boot thường nhưng không được phép lặp). Ghi tại
`docs/designs/desktop-only-reorg.md` mục "Phát hành v0.5.0".

Tham chiếu: logic userData hiện tại trong `apps/desktop/src/main/index.ts`
(tìm `setPath` hoặc nơi quyết định userData cho test mode).

Việc cần làm:

1. Env `OIA_USER_DATA_DIR` (hoặc cờ tương đương) được tôn trọng cả khi
   `app.isPackaged`, chỉ chấp nhận đường dẫn tuyệt đối, từ chối nếu trỏ vào
   `$HOME/Library/Application Support` mặc định.
2. Script `apps/desktop/scripts/packaged-smoke.mjs`: mount không cần (macOS chạy
   binary trong `dist/mac-arm64/Oia.app/Contents/MacOS/Oia`), set env temp dir,
   chạy kịch bản smoke tối thiểu (boot, utility up, 1 task mock), exit code rõ.
3. Test error path: env trỏ đường dẫn không ghi được thì app phải fail sớm với
   thông điệp rõ, không rơi về profile mặc định.

Gate: packaged smoke pass trên macOS đóng gói; không ghi nhận về Windows cho
đến khi có máy (D3).

Phát hiện kèm khi làm (ghi lại vì ảnh hưởng phân phối, không chỉ test): bản
đóng gói local bật fuse `enableCookieEncryption` + ký ad-hoc với identity mới
mỗi lần build → keychain item "Oia Safe Storage" cũ không còn khớp ACL → macOS
đứng dialog SecurityAgent chờ bấm Allow, app KHÔNG mở cửa sổ, KHÔNG in log,
process sống. Script packaged-smoke tự dọn key cũ trước khi chạy (vô hại: app
không lưu cookie đăng nhập, auth codex nằm trong CODEX_HOME). Khi có signing
thật (SG-12) hiện tượng tự hết.

### SG-3. Mở rộng ứng viên khớp phông

Khoảng trống: hiện chỉ 6 họ Lens (catalog đi kèm model) cộng phông hệ thống.
Phông lạ chỉ ra "closest available family". Lens là model 34 lớp
(`font_classifier.pt` của mixfont), không phủ font Việt phổ biến.

Tham chiếu code:

- `apps/desktop/src/renderer/lib/font-reference.ts`: `buildFontReference`, giới hạn sáu dòng khớp.
- `apps/desktop/src/renderer/lib/deconstruct-font-match.ts`: `rankFontReferences`, coordinate descent.
- `apps/desktop/src/utility/lens.ts`: tiền xử lý + ONNX session.
- `packages/schema/src/font-reference.ts`: wire contract, đổi shape là breaking change.
- `apps/desktop/scripts/prepare-lens.py`: pin checksum upstream.
- Bằng chứng chất lượng hiện tại: `docs/private/surgepix-feature-audit-2026-11-09/quality-current/`, `landing-sample/visual-correction-metrics.json` (SSIM vùng chữ từng phần).

Hướng:

1. Ngắn hạn: bổ sung ứng viên hệ thống theo bảng phông Windows/macOS phổ biến
   cho seller VN (Arial, Tahoma, Times, Segoe UI...) vào danh sách đo pixel,
   không cần model mới.
2. Dài hạn: classifier OFL riêng (train trên Google Fonts subset có dấu) hoặc
   xin phép dùng Lens thương mại (SG-16). Nghiên cứu nền: `RESEARCH-how-free.md`,
   Adobe DeepFont, FasterViT-2 đã dẫn trong report.
3. Benchmark cố định (SG-6) là điều kiện trước khi tuyên bố cải thiện.

### SG-4. OCR dấu tiếng Việt: crop re-read hai bước

Khoảng trống: một lượt thật đọc "Cửa Hỏa" thành "Cửa Hòa", ₫ thành đ. Bằng
chứng nguyên lý đã có: crop native 420x83 đọc đúng "ghé chơi nha", Courier nhỏ
cần upscale. Owner từng chốt giữ 1 ảnh + 1 read vì chi phí, chưa chốt vĩnh viễn.

Tham chiếu: `docs/private/surgepix-feature-audit-2026-11-09/ocr-crop-test.mjs`,
`e2e-landing.cjs` (dòng OCR sai), `d22-live/ocr.json`.

Việc cần làm (nếu owner mở lại): chỉ re-read crop của những dòng có dấu hiệu
nguy hiểm (ký tự đặc biệt VN, tỷ lệ glyph thấp), giới hạn thêm đúng 1 read,
hiện giá trước khi chạy, giữ nguyên chính sách checkpoint không mất chữ khi lỗi.

### SG-5. Nền phức tạp sau tách chữ: inpaint local tùy chọn

Khoảng trống: nền trơn tái tạo cục bộ, nền họa tiết tốn thêm 1 lượt tạo ảnh.
SurgePix inpaint phía server (có khi để lại bản sao chủ thể trong nền, report
mục 4), nhưng người dùng của họ không trả thêm bước.

Tham chiếu: `packages/tasks/src/deconstruct-plate.ts` (phân vùng nền), PoC model
inpaint trong `docs/private/surgepix-feature-audit-2026-11-09/poc-local-segment/MODEL-RESEARCH-2026.md`.

Hướng: đánh giá LaMa/MAT ONNX CPU cho vùng chữ (không phải cả ảnh), chạy như
tùy chọn "local repair" trước khi hỏi lượt gen; metric so sánh với plate hiện
tại trên bộ ảnh SG-6. Nếu chất lượng không đạt, ghi verdict và đóng hướng.

### SG-6. Benchmark chất lượng đa ảnh cho D22/D23

Khoảng trống: mọi số công bố (SSIM 0,95 toàn ảnh landing, IoU mask 0,52 đến
0,59) đều từ một ảnh synthetic cộng vài ảnh thật. Không đại diện.

Tham chiếu: `quality-metrics.py`, `e2e-real.cjs`, `e2e-landing.cjs`,
`landing-rerender.cjs` (đều trong thư mục audit riêng tư).

Việc cần làm:

1. Chọn 10 đến 20 artwork thật đa loại: poster bán hàng, ảnh ghép sản phẩm, ảnh
   chụp màn hình livestream, nền gradient, nền họa tiết.
2. Ground truth: chữ đúng + phông dùng + vị trí hộp (không cần pixel-perfect).
3. Chạy harness ghi: SSIM vùng chữ, lệch tâm, sai số cỡ chữ, số dòng OCR sai,
   số vùng phải dùng lượt gen nền.
4. Ngưỡng nghiệm thu do owner chốt sau khi có phân bố số liệu; công bố trung
   bình cộng khoảng tin cậy, không công bố số lẻ của một ảnh.

---

## B. Thiếu hẳn so với những gì đã thấy ở SurgePix

### SG-7. Wire PPT Translator vào UI tools — DONE (commit 06599b8, gates: packages/tasks 167 test gồm 9 test mới zip round-trip + TaskStore lane, desktop 220, shot gate 2 mục mới: translate e2e với deck fixture + file hỏng báo rõ không crash, nội dung pptx kết quả kiểm tra chứa run đã dịch)

Khoảng trống: `apps/desktop/src/renderer/lib/tools-registry.ts` dòng 37 ghi
`implemented: false`, `kind: "landing"`, trong khi skill đã có:
`packages/skills/skills/oia-ppt-translate/` và `oia-image-translate/`.
SurgePix có Image/PPT Translator trong Toolbox.

Việc cần làm:

1. Task `ppt-translate` trong `packages/tasks/src/processors.ts` theo pattern
   `makeGeneratePresentation` (dùng jszip đọc PPTX, LLM dịch, pptxgenjs xuất).
2. Đổi registry entry sang kind tương ứng + `implemented: true`, xóa trang
   landing đứng tên nếu còn.
3. Shot gate ToolRunner chạy tới completions với file PPTX mẫu nhỏ, error path
   là file hỏng phải báo rõ không crash.

### SG-8. Crop ảnh trong editor toolbar

Khoảng trống: ContextToolbar ảnh hiện có Replace, Edit with AI, Circle to edit,
Make text editable, Split layer (`ContextToolbar.tsx`). Không có Crop. (Crop
trong `font-mask.ts` là nội bộ khớp phông, không phải công cụ người dùng.)

Hướng: dùng Fabric crop hoặc thay clipPath, cập nhật scene schema nếu cần
trường crop, giữ phím tắt, shot gate khôi phục và export sau crop.

### SG-9. Nút Remove background trên ContextToolbar ảnh — DONE (commit f87bcf6, gates: shot gate hai nhánh dùng fake rembg stateful trên PATH: nhánh lỗi giữ nguyên layer + thông báo trung thực, nhánh thành công đổi src layer qua getSrc(); desktop 220; smoke; crash-smoke)

Khoảng trống: task `remove-background` đã đăng ký trong
`packages/services/src/context.ts` (dòng ~97) và có skill `oia-remove-background`,
nhưng editor không có nút một chạm trên layer ảnh. SurgePix có ngay trên toolbar.

Hướng: thêm nút gọi task hiện có qua bridge (không viết engine mới), poll
`poll-task.ts`, kết quả thay layer hoặc thêm layer mới kèm undo. Gate: mock
provider path + error path provider lỗi giữ layer gốc.

### SG-10. Draw tool: layer vẽ tay

Khoảng trống: `markup-annotate.ts` là annotation view-layer cho edit request,
không phải layer vẽ persisted. SurgePix editor có Draw.

Tham chiếu: `packages/schema/src/scene.ts` (thêm type Path/Pencil),
`packages/canvas/src/editor.ts` (chế độ vẽ, chặn selection khi vẽ),
serialization qua `FabricObject.customProperties` (xem marker `recoveredTextLine`
như tiền lệ), export PNG/PDF/PPTX phải giữ path.

### SG-11. Table trong editor

Khoảng trống: SurgePix có Tables. Oia không có primitive bảng; pptxgenjs hỗ trợ
table khi export.

Hướng: group Rect + Textbox theo grid, edit cell qua Inspector, giữ thứ tự z,
serialize như group thường (tránh schema mới nếu được). Ưu tiên thấp vì seller
dùng bảng ít hơn text/ảnh.

---

## C. Khoảng cách phân phối và onboarding

### SG-12. Code signing + notarization

Bằng chứng khoảng cách: release v0.5.0 notes phải kèm hướng dẫn vượt
Gatekeeper/SmartScreen; `apps/desktop/electron-builder.yml` có `identity: null`
cố ý theo no-signing budget plan.

Việc: Apple Developer ID + notarytool cho dmg, cert Windows hoặc giữ self-serve
docs nếu kinh phí chưa duyệt. Cần owner duyệt chi phí certificate (nếu có phí
thì phải xác nhận trước khi mua theo quy tắc chung). Sau khi ký: cập nhật
release notes, install page, README bỏ cảnh báo tương ứng.

### SG-13. Auto-update

Phụ thuộc SG-12 (electron-updater yêu cầu chữ ký trên Windows). Sau khi ký:
dùng GitHub releases làm update server, kiểm thử update thật trên cả hai OS, ghi
quyết định vào ledger mới (không sửa D cũ).

### SG-14. Giảm installer ~395 MB

Thành phần: cặp codex pin ~166 MB (extraResources), lens ~45 MB, Electron +
node_modules còn lại. Hướng: chuyển codex và lens sang download-on-first-run
giống SAM (checksum pinned + atomic rename, tiền lệ trong `segmentation/models.ts`),
installer còn Electron + app code. Đánh giá lại trải nghiệm người dùng offline
và lần chạy đầu. Nợ asarUnpack onnxruntime-node vẫn giữ.

### SG-15. Nợ D19 của site

Đã ghi trong ledger D19: asset release đặt tên không version để pin
`releases/latest/download` cố định; đồng bộ brand app sáng với site tối; trang
SEO tiếng Việt; demo GIF 15 giây cho README. Làm theo checklist đó, không mở
scope mới.

---

## D. Cần owner quyết, chưa mở làm

### SG-16. Lens license thương mại

NOTICE trong app: Mixfont Lens chỉ cho dùng cá nhân, học thuật, phi thương mại.
Trước khi Oia có bất kỳ dòng tiền nào (paid tier, phí cài đặt, quảng cáo), phải
chọn: xin phép bản thương mại mixfont, hoặc thay bằng classifier OFL tự train
(liên quan SG-3). Không ship tính phí khi đang bundle Lens hiện tại.

### SG-17. Share/collaborate web

Desktop-only là quyết định kiến trúc (reorg step 6). Share link kiểu SurgePix
cần backend và tài khoản. Nếu cần giao tiếp nhóm: phương án desktop-first là
export gói (PPTX/PNG/ZIP) hoặc xem lại agent JSON. Mở lại chỉ khi owner đổi
quyết định, khi đó lập doc design riêng.

### SG-18. Gallery cộng đồng

Cần backend kiểm duyệt và giấy phép nội dung. Phương án trung gian không cần
server: trang curated trên site hiện output thật kèm provenance (đã có tiền lệ
"Grown from real prompts" trong template pages), mỗi batch phải qua qui trình
marketing trung thực như `docs/verification/marketing-assets.md`.

---

## E. Việc chung Windows máy vật lý (áp dụng SG-1, SG-3, SG-6, SG-2)

CI Windows runner xanh chỉ chứng minh wiring. Trước khi tuyên bố parity Windows
(D3), cần một máy vật lý chạy qua: đăng nhập thật, 1 lượt sinh ảnh, deconstruct
1 artwork tiếng Việt (khớp phông dùng phông hệ thống Windows), split layer với
model thật, packaged smoke (SG-2), auto-grow text khi gõ. Bắt buộc đọc
`docs/reference/cross-platform-support.md` trước khi đụng process spawn, path
hoặc bridge.

## Cách cập nhật doc này

1. Mỗi mục hoàn thành: đánh `DONE (commit <sha>, gates: <danh sách>)` ngay tại
   tiêu đề mục, giữ nội dung để tra cứu.
2. Mục blocker mới phát hiện khi làm: thêm vào nhóm đúng, không mở mục trống.
3. Đăng ký mới trong `docs/designs/SITEMAP.md` khi thêm doc liên quan.
4. Không dùng doc này thay cho quyết định sản phẩm: thay đổi hướng lớn vẫn ghi
   ledger D trong `desktop-only-reorg.md`, doc này chỉ trỏ tới.
