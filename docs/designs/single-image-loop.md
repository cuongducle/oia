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
3. **SL-3 Edit round-trip + loop: ✅ (18/11/2026, mock + REAL run)** nút "Edit regions" trong panel Regions: MỘT lượt codex edit mang TẤT CẢ vùng (regionComposite flatten + marksPrompt + editMode markup flatten, đúng kênh ME); label bản mới "Edit N" theo kind job; Undo lùi con trỏ (không xóa, B7), Latest quay về cuối, Before/After toggle badge + khóa overlay; nút biến Stop khi đang edit; capability gate markupEdit (provider không hỗ trợ hiện dòng giải thích thay nút); disable khi thiếu note + input viền đỏ + title giải thích. Gates: mock trọn vòng trong shot (gen mock → 2 vùng → edit mock → meta "Edit 1 · 2/2" + dataUrl đổi → undo "Generated 1/2" → latest "2/2" → compare badge Before); error-path "thiếu note không gửi" pin trong lane (nút disabled khi note rỗng); job fail/abort giữ bản kế thừa bằng thiết kế (chỉ canvas event push version, cancel/error path đã pin ở services/DA OC-4 + teardown #8, không tái pin ở view để tránh lane race với mock 1s); smoke xanh. **REAL run (cặp codex thật)**: `scripts/loop-edit-real.mjs`, 2 vùng đánh số trên banner thật của SL-1 (box: đổi nút MUA NGAY sang đỏ giữ chữ; arrow: xóa doodle vương miện): outcome completed, 66s, quota đúng 1 planner + 1 image, dims giữ 1024×1536; vision check 4 tiêu chí 0 defect: vùng 1 + vùng 2 sửa đúng, TOÀN BỘ marker đỏ dọn sạch, mọi phần tử ngoài vùng nguyên vẹn chi tiết. Evidence: `docs/private/real-runs/2026-11-18-sil-sl3-edit/`.
4. **SL-4 Đánh bóng: ✅ (18/11/2026, mock-verified)** keyboard: Esc hủy draft (giữ từ SL-2), phím 1/2/3 đổi Pan/Box/Arrow (không ăn khi đang gõ input/textarea/select), Delete/Backspace xóa vùng đang chọn; mark mới tạo TỰ CHỌN (Del xóa ngay được), click row toggle chọn, focus ô note cũng chọn; vòng chọn nét đứt trắng trên overlay khớp row highlighted; hint lần đầu "Circle the part you want changed, one box per fix." trên stage, tắt sau mark đầu và nhớ qua localStorage (pattern OC-6); dòng key hint trong panel khi có vùng. Shot lane pin đủ: hint hiện trên profile sạch TRƯỚC mark đầu + biến mất sau, phím 2 vẽ được box thật qua pointer, Delete xóa vùng chọn, 12 vùng cùng lúc overlay vẫn vẽ (đỏ 30.453 px, vision verify chip 1→12 tuần tự + selection ring khớp row). **Bug lane bắt được khi làm**: marks bị reset sau edit round (adoptCanvas chủ động xóa vì ảnh mới), lane đầu đếm kỳ vọng sai - hành vi reset là đúng thiết kế, lane sửa theo. Gates: build/test/typecheck/shot toàn xanh.

## Rủi ro + lỗi-path đã cân

- Model bỏ sót 1 trong N vùng hoặc hiểu nhầm số: critic không chạy cho edit vòng lặp v1 (chi phí +1 read mỗi vòng); bù: mỗi vòng user nhìn thấy ngay kết quả, sót thì annotate lại đúng vùng đó, vòng sau chỉ tốn đúng vùng còn hỏng. Ghi số liệu thực tế qua real run SL-3; nếu bỏ sót nhiều, mở lại quyết định critic-lite.
- Nhiều vùng trên 1 lượt tăng rủi ro hiểu nhầm so với 1 vùng/lượt: vẫn để user tự do; gợi ý UI không giới hạn cứng v1.
- Composite đỏ che vùng nhỏ cần sửa: marker dày 1,5% cạnh ngắn đã prove; số vùng đặt NGOÀI shape khi box đủ to, mũi tên đặt ở đuôi.

## Câu hỏi mở (không chặn SL-1/SL-2)

- Giữ annotation giữa các vòng (vùng cũ vẽ lại trên bản mới) để thử lại cùng vùng: ME đã để mở câu này; SIL same, đề xuất không giữ v1 (bản mới đã khác ảnh).
- Có cần ô "global note" (chỉ dẫn áp cả ảnh, không gắn vùng) không: đề xuất có ở SL-3 nếu real run cho thấy nhu cầu ("làm toàn ảnh ấm hơn").

## Đợt sửa sau teardown 18/11 (P0 + #8, tất cả đã đóng)

Teardown chủ động (owner yêu cầu mổ sẻ) tìm 6 lỗi P0 + #8, sửa hết trong ngày:

1. **Undo giữ marks của ảnh khác (P0-1) + fit stale (P0-1b):** sửa bằng effect `[current]` duy nhất: marks clear + selection clear + `setFit(null)` + reset view về base mỗi khi đổi ảnh hiển thị; fit effect là nơi duy nhất tính fit + base center (một nguồn sự thật). Base giờ CENTER ảnh (trước đây top-left, ảnh lệch góc trên trái - teardown tìm thêm).
2. **Focus/click toggle đánh nhau (P0-2):** row click bỏ qua khi target là input (focus đã chọn); nút X stopPropagation.
3. **Vòng edit im lặng (P0-3):** RunBar trong loopTools khi `busy && current` (spin + Editing/Generating… + giây + steps); RunPanel vẫn chỉ màn đầu.
4. **Wheel passive (P0-5):** listener native `{ passive: false }` qua ref, bỏ prop onWheel.
5. **Pan không biên (P0-6):** `clampPan` (loop-marks.ts, PAN_KEEP_FRACTION 0,12, unit test 3 case) + double-click reset về base center.
6. **Chi phí label lệch pha (#20):** label gen ẩn khi `current` tồn tại; `autoRefineOn` đọc mỗi render → state `autoRefinePref` một lần mount; submit vẫn tự đọc pref lúc chạy.
7. **#8 tách hẳn:** `mergeVersion` ra `loop-versions.ts` thuần + 5 unit test (replace cùng job, push job mới, null jobId không replace, label Generate/Edit N).
8. **Chip clip (#13):** `clampChipAnchor` trong drawMark (unit test).
9. **MIN_BOX AND 2 chiều (#14), phím 1 tắt compare (#12), jobKind ref+state đôi (ref cho closure mount, state cho render).**

Gates sau đợt: tsc + 321 test + shot trọn vòng xanh (lane edit ghi nhận runbar OBSERVATIONAL, không fail: mock xong nhanh hơn poll tick, đúng race teardown đã báo; bar kiểm tra bằng mắt lúc dev/real run). Lane marks red 8.598px, polish 12 vùng 27.043px. Bug bắt thêm: chuỗi JSON lớn bị đứt giữa các edit khi qua tool (tái hiện được, sửa bằng cắt đợt nhỏ).

Còn đỗ lại CÓ CHỦ ĐÍCH (từ teardown, không phải bỏ sót): rAF chạy liên tục ở idle (dirty-flag là slice riêng), versions dataUrl không cap, không cap số vùng + note xuống dòng, shot lane phình (index.ts ~3.000 dòng), script real scrape URL bằng regex, session mất khi đóng cửa sổ không cảnh báo, "Start over" xóa sạch history không hỏi.

## Đợt polish UI 18/11 tối (research-driven)

Research pattern 4 nhóm tool (Photoshop Generative Fill + Contextual Task Bar, Canva Magic Edit, FLUX Kontext playgrounds, Figma AI; nguồn URL trong commit) + machine-vision audit khắt khe UI cũ. Bài học áp dụng:

- **Artboard contract** (PS): bỏ checkerboard (ảnh opaque không cần), nền stage flat #e9e7e1, ảnh có border + shadow 2 tầng. Trước đây ảnh "nổi" trên checker vô định hướng document.
- **Zoom cluster** (PS/Figma): "− / n% / + / Fit" góc dưới-phải stage, % click để fit, wheel vẫn pin con trỏ; zoomPct mirror state để label re-render; tâm zoom = tâm stage.
- **kbd badges** (Figma V/H/K): Pan/Box/Arrow hiện số 1/2/3 ngay trên nút.
- **Chip collision** (audit phơi qua shot 12 vùng): `layoutChips` (loop-marks.ts) nudge chip chồng xuống 1,3-chip/bước (tối đa 3, clamp trong ảnh), dùng chung rAF overlay VÀ regionComposite (màn hình và ảnh gửi nhất quán), 3 unit test. Giới hạn ghi trung thực: dày đặc CỰC ĐOAN (12 vùng cạnh nhau vài chục px) vẫn chồng ngang vì chip phải đủ to để model đọc; người thật vẽ vùng riêng biệt thì ổn, leader-line là đợt sau nếu có nhu cầu thật.
- **Hover sync** (Figma): hover row panel → vòng amber trên marker ảnh (selected vẫn trắng). Header panel "Regions · n/m described".
- **Progress trên canvas** (Canva overlays): veil mờ + spinner + "Editing… ns" giữa ảnh khi job chạy (bù cho RunBar nằm ngoài canvas).
- **Chip màu #b91c1c** thay đỏ thuần (audit: đỏ chói đọc là error; marker ĐỎ trên composite giữ #ff0000 vì probe P3 prove màu đó cho model).

Gates: tsc + 328 test (3 test layoutChips mới) + shot trọn vòng xanh; vision verify artboard/zoom/kbd/count pass từng mục. Đợt sau chờ nhu cầu: leader-line chip, version filmstrip thumbnail, segmented After/Before (đổi testid compare sẽ phá lane, làm cùng filmstrip).

## Canvas-first layout 18/11 tối (owner duyệt mô hình B)

Research 3 mô hình placement prompt sau gen: (A) chat feed (ChatGPT/Gemini), (B) canvas-first + prompt bar đáy (Krea, Midjourney "creative memory", Ideogram), (C) side panel (Whisk/Figma/OpenArt). Owner duyệt B kèm chỉ đạo riêng: "chưa có ảnh thì ko cần hiện composer card đâu" - tức KHÔNG phải morphing 2 trạng thái mà LUÔN canvas-first ngay từ đầu:

- Chưa có ảnh: canvas rỗng (dashed placeholder + icon + "Describe the image below, then Generate") chiếm phần lớn màn; prompt bar 1 card nhỏ PIN đáy; KHÔNG còn header "Edit loop" lớn, không composer card trên.
- Gen xong: ảnh chiếm canvas (stage + tools + Regions panel như cũ), prompt bar vẫn pin đáy, prompt cũ giữ trong ô (Midjourney remix memory), rows co từ 2 về 1 khi đã có ảnh; cost label chỉ hiện khi chưa có ảnh (luật cũ giữ).
- RunPanel lúc gen đầu: hiển thị TRONG canvas rỗng (loop-empty chuyển thành vùng chạy), không còn floating cuối trang.
- Lane shot pin layout mới: assert [data-testid=loop-empty] h1 trước khi submit + artifact mới out/desktop-loop-empty.png; artifact cũ desktop-loop.png (stale từ layout cũ) đã xóa. Vision verify: empty canvas ~70% chiều cao + bar đáy + disabled Generate đúng state, không artifact cũ.

Gates: tsc + 328 test + shot trọn vòng xanh. Câu mở còn lại từ đợt research: version filmstrip + segmented After/Before vẫn đỗ lại chờ nhu cầu.

## Trả nợ nhóm 1 (18/11 tối, owner "làm luôn")

Ba việc kỹ thuật đỗ lại sau teardown, tất cả đóng:

1. **Idle rAF:** overlay loop chuyển sang dirty-flag (`dirtyRef` + `markDirty()`): rAF vẫn tick nhưng bỏ qua paint khi không đổi gì; mọi mutator ref-based (pan, wheel zoom, zoom cluster, double-click, draft pointer) đánh dirty; state deps (marks/selection/hover/fit/compare) tự restart effect và đánh dirty lần đầu. CPU thật sự chi cho canvas khi đứng im = 0.
2. **Memory cap:** `capVersions` (loop-versions.ts, MAX_LOOP_VERSIONS = 10, pure, 2 unit test) áp ngay sau mergeVersion trong adoptCanvas; cursor luôn reset latest khi push (đã có), bản cũ nhất rơi ra ngoài khi vượt 10, chặn ~20MB trần trên thay vì vô hạn.
3. **Tách shot lane SIL:** toàn bộ lane SIL (SL-1 đến polish, 251 dòng) chuyển sang `src/main/shots/sil.ts` (`shotSil(win, snap)`, pattern shots/), index.ts còn lại gọi 1 dòng; 8 chỗ app.exit(31) giờ sống trong file riêng cùng lane chúng validate. index.ts: 3234 → 2985 dòng.

Gates: tsc + 330 test (2 capVersions mới) + shot trọn vòng xanh (marks red 8.940px, polish 12 vùng 30.238px).

## UI polish vòng 4 (18/11 khuya, "mài lại cho đẹp chuyên nghiệp")

Bốn item từ danh sách đỗ lại, đóng:

1. **Overlay register tách đôi:** `drawMark` nhận `display: "canvas" | "composite"`. Canvas hiển thị stroke 60% + fill đỏ 8% (thấy tác phẩm bên dưới, ngôn ngữ pro tool); composite gửi model giữ nguyên đỏ đặc #ff0000 không fill (probe P3 không đụng).
2. **Version filmstrip:** dải thumbnail dưới toolbar (`loop-version-N`, active viền đậm), click nhảy version, thay hẳn nút Undo/Latest. Eye Before giữ nguyên vai compare.
3. **Meta humanize:** `1360 × 2048 · Version 2 of 2 · Edit 1 · 1s` thay `1360×2048 · Edit 1 · 2/2 · 1s`; lane asserts sửa theo (sil.ts).
4. **Progress bar n/m:** thanh mỏng dưới header Regions panel, đỏ tiến theo số vùng đã mô tả (aria progressbar).

Vision audit vòng này phát hiện + fix luôn: **box kéo từ nền xám ngoài ảnh vẫn được commit** (3/12 box nằm ngoài tác phẩm). Fix: clamp box vào trong ảnh khi thả (x/y/edge đều kẹp, arrow 2 đầu cũng kẹp); lane shot đổi kéo theo bbox ảnh thật (`loop-image` rect) thay vì overlay rect.

Vision verify cuối: 12/12 box trong tác phẩm, không cắt mép, chip đọc rõ. Còn ghi nhận: cluster box sát nhau (10-12) outline gần chạm nhau - đã có selected dashed phân biệt, chấp nhận.

Gates: tsc + 330 test + shot trọn vòng xanh.

## Mở rộng vòng 5 (18/11 khuya, owner chọn 1-3-4 từ bản đồ mở rộng)

Ba năng lực mới, mỗi cái một commit scope trong cùng đợt:

1. **Import ảnh có sẵn (chọn 1):** kéo PNG/JPEG/WebP vào canvas hoặc nút "Open an image" trên empty state → decode → cap cạnh dài 2048px (`importPlan`, pure, 5 unit test; quota honesty: ảnh 4000px của điện thoại không đốt token vô ích) → version slot "Imported" (jobId null, không thay slot ai). Tool giờ dùng được cho người đã có ảnh sản phẩm, không chỉ sinh từ prompt.
2. **Giữ vùng giữa các vòng + kéo/di chuyển (chọn 3):** sau 1 edit round hoàn thành, vùng + note giữ nguyên trên ảnh mới (carryMarksRef), vòng sau chỉ sửa note là chạy tiếp. Tool Pan (1) kiêm move-tool: bấm trúng vùng → kéo cả vùng (clamp trong ảnh), box đang chọn có handle góc dưới-phải để resize (min MIN_BOX, clamp mép). Tool Box/Arrow luôn vẽ mới (kéo đè lên vùng cũ là vùng mới, không phải move). markHit/moveMark/resizeBox pure trong loop-marks.ts, 4 unit test.
3. **Session persist (chọn 4):** phiên (versions + cursor + prompt + marks) lưu atomic vào dataDir/loop-session.json qua IPC mới `loop:session:save/load` (schema zod chặn file rác: dataUrl chỉ image, tối đa 10 version, cursor phải trong stack, mark union box/arrow), debounce 800ms, Start over = xóa file. Reload app → phiên sống lại nguyên vẹn, marks restore không bị effect clear đánh rơi (carry flag tái dùng).

Lane shot thêm "session restore": reload renderer giữa chừng, đòi meta Version 2 of 2 + 2 vùng carry + prompt còn. Polish lane đổi đếm delta (carry marks không còn bị tính là box mới).

Gates: tsc + 344 test (9 mới) + shot 6 lane SIL xanh + smoke + crash-smoke (utility dispatch mới sống qua kill-restart).
