---
type: "Design"
title: "Single-image edit loop (SIL): gen 1 ảnh, khoanh vùng, sửa, lặp"
description: "Một luồng duy nhất làm thật xuất sắc theo owner 18/11/2026: prompt sinh 1 ảnh, vẽ box/mũi tên từng vùng kèm chỉ dẫn riêng, gửi codex edit (flatten), lặp lại trên kết quả; mọi nền tái dụng ME + DA hiện có."
tags: [design, editor, markup, loop]
status: proposed
generated: { by: agent, at: 2026-11-18T00:00:00Z }
---

# SIL: Single-image edit loop

**Ngày:** 18/11/2026
**Quyết định cha:** owner 18/11/2026: "phức tạp quá, làm 1 luồng này thật xuất sắc thôi: gen 1 ảnh, vẽ box vẽ mũi tên cho user nhập prompt vùng này sửa thế nào, rồi gửi sang codex. Thế thôi." Toàn bộ W1.3 trở đi và W2-W4 trong [execution-plan.md](execution-plan.md) đỗ lại (không hủy), SIL là việc đang làm.
**Liên quan:** [markup-edit.md](markup-edit.md) (ME đã ship: flatten composite, clause marker, capability gate; SIL mở rộng công cụ và đưa ra ngoài Editor), [designer-agent-loop.md](designer-agent-loop.md) (DA: đường gen quality + cost law + critic), [selection-bound-edits.md](selection-bound-edits.md) (wire editMode + clause khóa dims).

## Vì sao

Khoảnh khắc giá trị của Oia với seller không phải là editor nhiều lớp hay deck 9 trang, mà là vòng lặp nhỏ nhất có thể: "tôi có 1 ảnh, chỗ này sửa thế này, chỗ kia sửa thế kia, xong". ME đã chứng minh đường kỹ thuật (probe P3: model hiểu marker flatten, tự dọn sạch, sửa đúng vùng), nhưng ME nằm sâu trong Editor (phải có project, canvas, chọn layer, ContextToolbar), công cụ chỉ nét vẽ tự do, prompt là MỘT câu chung cho cả ảnh. SIL làm luồng đó thành sản phẩm: một màn, không khái niệm layer, không project, số vùng đánh thứ tự, mỗi vùng một chỉ dẫn, lặp vô hạn trên kết quả, mỗi vòng đúng 1 lượt edit.

## Non-goals (giữ luồng thật đơn giản)

- Không đụng Editor/ME hiện có: canvas nhiều layer giữ nguyên vai trò, không refactor, không xóa.
- Không deck/outline/multi-page trong màn này: đúng 1 ảnh tại một thời điểm.
- Không persist project v1: phiên làm việc trong bộ nhớ, kết quả lấy về bằng Save PNG. Mở lại persistence khi có asks thật.
- Không field-mode markup (OpenAI lane), không mask/inpaint thật: codex flatten đã chứng minh (P3 + ME ship).
- Không thêm provider mới, không thêm network surface (D15 giữ nguyên).

## Luồng người dùng

1. **Gen.** Một ô prompt + style preset + khổ (tái dụng composer hiện có của Home). Nút Generate hiện cost label trung thực theo luật DA-5 (kể cả worst case auto-refine). Sinh xong hiện 1 ảnh lớn giữa màn.
2. **Mark.** Hai công cụ: Box (khoanh vùng chữ nhật) và Arrow (chỉ điểm). Vẽ xong tự đánh số đỏ: 1, 2, 3 theo thứ tự tạo. Panel bên liệt kê từng vùng: "Region 1 [box]" kèm ô text "What should change here?". Xóa vùng bằng nút x. Một vùng chưa có text thì nút Edit disable kèm ghi rõ vùng nào thiếu.
3. **Edit.** Nút "Edit marked regions (≈ 1 image edit)" (giá hiện trước, Stop như mọi job). Một lượt codex edit duy nhất cho TẤT CẢ vùng: ảnh gốc + marker đỏ đánh số composite phẳng + chỉ dẫn liệt kê từng vùng theo số.
4. **Loop.** Kết quả thay thế ảnh hiện tại; bản trước vào history của phiên. Toggle Before/After; nút Undo về từng bản; annotate tiếp trên bản mới và chạy vòng sau. Nút Save PNG lấy ảnh hiện tại ra ngoài.
5. Esc hủy shape đang vẽ; vẽ tiếp không đốt gì (chưa gọi job là chưa tốn, đúng ME).

## Thiết kế

### View mới, không đụng shell

View `Loop.tsx` + 1 entry nav "Loop". Shell còn lại giữ nguyên (hội tụ shell canvas là slice riêng đã ghi trong execution-plan). Không thêm khái niệm project: request chạy như chat request thường (session AI trong phiên, đúng pattern Editor aiSessionId).

### Gen: đường designer hiện có, chốt 1 ảnh

- Tái dụng nguyên vẹn pipeline DA: craft rules, research + auto refine theo default đã duyệt, style presets, critic. Không viết đường imagegen thẳng mới (tránh 2 đường gen chất lượng lệch nhau).
- Khác duy nhất: pages = 1 và bỏ bước confirm outline cho luồng này (outline gate là của deck; cửa vào loop phải 1 click). Cost label bù đắp sự minh bạch: "Research + Auto refine on · up to 2 images + 2 reads".
- Provider mock: gen vẫn chạy (mock pair), nút Edit ẩn theo capability markupEdit đúng luật ME (mock không đánh dấu markup-capable thì cả nút Edit ẩn? Không: mock KHAI flatten như ME đã làm, nên mock chạy trọn loop, shot/smoke dựa vào đó).

### Mark: shapes đánh số, toạ độ natural

- Mở rộng `markup-annotate.ts` (giữ nguyên API strokes cũ cho Editor): thêm shape `box {x,y,w,h}` và `arrow {from,to}` trong không gian pixel natural của ảnh; `viewportToNatural/naturalToViewport` dùng lại nguyên vẹn, `objectMatrix` = identity (ảnh hiển thị fit, không rotate).
- Overlay canvas 2D riêng (không fabric): rAF vẽ lại khi pan/zoom; CSS width/height 100% (bài học death-spiral canvas); marker đỏ nét dày `markerWidthFor` đã có, số vùng vẽ cạnh shape (nền chip đỏ, chữ trắng).
- Pan/zoom cơ bản ngay từ đầu: wheel zoom quanh con trỏ, space/kéo pan; vẽ vùng nhỏ trên ảnh 1024+ không zoom là không dùng được.
- Shapes sống trong state React của phiên, KHÔNG BAO GIỜ vào scene JSON hay project (purity như ME-3, test pin).

### Per-region prompt + composite

- Mỗi shape có `note: string`. Composite: vẽ các shape + số lên canvas natural size rồi flatten vào ảnh gốc (đúng ràng buộc dims bằng pixel của ME), trả dataUrl.
- Prompt gửi: liệt kê theo số: "Region 1 (red box): <note>. Region 2 (red arrow): <note>." + clause marker-removal (tái dùng nguyên văn buildEditClauses đường ME, đã chứng minh P3) + clause khóa dims của A3.
- Wire không mới: `editMode.markup = "flatten"` + referenceImages[0] = composite, y hệt ME-2 gửi hôm nay, chỉ khác nguồn ảnh (kết quả gen thay vì layer canvas).

### Iterate + history

- State phiên: `versions: {dataUrl, label, jobId}[]` + con trỏ bản hiện tại. Edit thành công push bản mới; Undo lùi con trỏ (không xóa, B7: mọi bản đến từ job thật có jobId).
- Before/After: toggle giữ 2 bản liền kề; không làm slider A/B ở v1.
- Job fail/abort giữa vòng: bản hiện tại bất động, thông báo lỗi theo kênh lỗi duy nhất, 0 push giả (records must not lie).
- Ảnh trả về sai dims (model không nghe clause): hiển thị bản mới như nó là, note nhỏ "size changed" trong history; không ép crop.

### Save

Nút Save PNG: dialog save của main qua bridge (đường Tools đã có), tên gợi ý `loop-<n>-<timestamp>.png`. Copy clipboard để làm sau nếu có asks.

## Slices + gates

1. **SL-1 View + Gen 1 ảnh: ✅ (18/11/2026, mock + REAL run)** view `Loop.tsx` + nav "Edit loop" + icon, chạy designer pages=1 KHÔNG outline, ảnh phẳng qua `scene-flatten.ts` (fabric offscreen → PNG dataUrl, cùng đường exportPng của Home), Save PNG qua saveExport, Start over. Cost label tái dùng law DA-5. **Bug thật bắt được lúc chạy (đã fix + pin)**: auto refine on khiến MỘT job yield nhiều canvas events, mỗi event đẩy 1 version vào history, meta đầu tiên hiện "Edit 3" dù user mới gen lần đầu; sửa: một job đóng góp đúng MỘT slot, candidate sau thay slot trước (canvas cuối là bản thắng cuộc designer yield); shot pin meta phải chứa "Generated" và không khớp /Edit \d/. Lane shot exit 31, artifact `out/desktop-loop.png`; build/test/typecheck/shot toàn repo xanh. **REAL run (owner pre-approve 18/11 "real cứ thoải mái")**: `scripts/loop-real.mjs`, request đúng Loop view (pages=1, research+auto-refine mặc định) trên cặp codex thật: outcome completed, 1.024×1.536 (2,1 MB), refine 1 vòng verdict pass (critic v3.3, path edit), 170s, quota 3 planner + 2 image; vision check: toàn bộ chữ Việt đúng dấu (TRÀ SỮA, GIẢM 20%, ƯU ĐÃI CHỈ HÔM NAY). Evidence: `docs/private/real-runs/2026-11-18-sil-sl1-gen/`. Quan sát lệch: research:true nhưng 0 researchNotes lần này (đường research có REAL_SMOKE riêng ở DA, theo dõi run sau).
   Gates còn lại: giữ nguyên cho tham chiếu: shot lane loop-gen (mock gen, ảnh hiện, Save ghi file thật); cost label đúng worst case; typecheck/build/test xanh.
2. **SL-2 Mark + composite: ✅ (18/11/2026, mock-verified)** lib `loop-marks.ts` (Box/Arrow trong natural px + chip số đỏ + `regionComposite` flatten + `marksPrompt` liệt kê vùng + `zoomAt` thuần), view mở rộng: toolbar Pan/Box/Arrow, overlay canvas 2D rAF (CSS 100% + attrs theo dpr, bài học death-spiral), wheel zoom quanh con trỏ + pan, Esc hủy draft (0 đốt), panel Regions đánh số + ô note + xóa; marks chỉ sống trong React state, view không có surface ghi scene/store nào (purity bằng thiết kế, không cần pin IPC vì không tồn tại đường gọi). 10 unit test mới (chipAnchor, arrowHead, marksPrompt, zoomAt cursor-pinned + clamp, MIN sizes). Shot lane SIL vẽ synthetic box + arrow qua pointer thật: 2 hàng region đúng số, chip 1 trên góc box + chip 2 ở đuôi mũi tên (vision verify), pixel đỏ 8.598 px trong crop; lane ME Editor cũ vẫn xanh. **Bug bắt được**: `setPointerCapture` throw với synthetic pointer, lần chạy đầu lane bắt rows rỗng; sửa theo đúng comment Editor ME đã ghi (try/catch, draft vẫn chạy). `regionComposite` chạy DOM canvas, verify pixel gián tiếp qua drawMark trên overlay; bản flatten thật đóng gate ở SL-3 khi gửi edit.
3. **SL-3 Edit round-trip + loop:** gửi edit (1 lượt cho mọi vùng), kết quả push history, Undo, Before/After, Stop, disable khi vùng thiếu note, provider không capability.
   Gates: mock pair happy + error-path (job fail giữ bản, abort giữ bản, thiếu note không gửi); shot kịch bản trọn vòng (gen mock, 2 vùng, edit mock, bản mới, undo); smoke xanh; 1 real run 1 vòng edit thật có annotation thật (owner đã duyệt quota rule 2026-11-10).
4. **SL-4 Đánh bóng:** keyboard (Esc hủy shape, Del xóa vùng đang chọn, phím 1/2 đổi công cụ), empty states, hint lần đầu ("circle the part you want changed, one box per fix"), hiệu năng overlay với 10+ vùng.
   Gates: shot update + chạy tay owner.

## Rủi ro + lỗi-path đã cân

- Model bỏ sót 1 trong N vùng hoặc hiểu nhầm số: critic không chạy cho edit vòng lặp v1 (chi phí +1 read mỗi vòng); bù: mỗi vòng user nhìn thấy ngay kết quả, sót thì annotate lại đúng vùng đó, vòng sau chỉ tốn đúng vùng còn hỏng. Ghi số liệu thực tế qua real run SL-3; nếu bỏ sót nhiều, mở lại quyết định critic-lite.
- Nhiều vùng trên 1 lượt tăng rủi ro hiểu nhầm so với 1 vùng/lượt: vẫn để user tự do; gợi ý UI không giới hạn cứng v1.
- Composite đỏ che vùng nhỏ cần sửa: marker dày 1,5% cạnh ngắn đã prove; số vùng đặt NGOÀI shape khi box đủ to, mũi tên đặt ở đuôi.

## Câu hỏi mở (không chặn SL-1/SL-2)

- Giữ annotation giữa các vòng (vùng cũ vẽ lại trên bản mới) để thử lại cùng vùng: ME đã để mở câu này; SIL same, đề xuất không giữ v1 (bản mới đã khác ảnh).
- Có cần ô "global note" (chỉ dẫn áp cả ảnh, không gắn vùng) không: đề xuất có ở SL-3 nếu real run cho thấy nhu cầu ("làm toàn ảnh ấm hơn").
