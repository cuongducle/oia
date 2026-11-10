---
title: "Draw + Tables: nghiên cứu best practice và kế hoạch triển khai SG-10, SG-11"
generated: { by: agent, at: 2026-11-10T00:00:00Z }
status: research
owner: cuongducle
source-of-truth: docs/designs/surgepix-parity-todo.md (SG-10, SG-11)
---

# Draw + Tables: nghiên cứu và kế hoạch

Mục đích: chuẩn bị triển khai 2 mục còn lại nhóm "Thiếu" của parity TODO:
SG-10 (Draw, layer vẽ tay persisted) và SG-11 (Table trong editor). Tài liệu
này tổng hợp cách các editor lớn làm (nguồn công khai, dẫn link), đối chiếu
hiện trạng code Oia, chốt phương án và danh sách gate nghiệm thu. Không thay
thế quyết định sản phẩm: 2 mục này đã nằm parity TODO, không mở scope mới.

Quy tắc: tuân thủ D20 (không em dash, không en dash).

## 1. Hiện trạng Oia (khám phá khi nghiên cứu, quan trọng)

Cả 2 tính năng ĐÃ CÓ STUB trong Editor, parity TODO ghi "thiếu" là thiếu phần
hoàn thiện chứ không phải dựng từ số 0:

- **Draw**: rail có panel `draw` (Editor.tsx panel === "draw") với nút
  Start/Stop gọi `toggleDraw()` (Editor.tsx:566): bật `canvas.isDrawingMode`
  với `PencilBrush` cứng width 6, màu `#18181b`. Thiếu: không nghe
  `path:created` nên path tạo ra không có `origin` (stampUser, TP.10) và
  `name`; không có chọn màu/độ dày; không có eraser; không pressure; không
  có cách thoát bằng Esc.
- **Tables**: rail có panel `tables` với `insertTable(n)` (Editor.tsx:554)
  tạo Group các Line kẻ lưới n x n. Đây là wireframe: không cell text,
  không resize cột, không thêm bớt dòng/cột, không chỉnh từng ô.
- **Cơ chế sẵn có tiếp nhận được**: history push trên `object:added` /
  `object:removed` / `object:modified` (Editor.tsx:353) nên path/group mới
  tự vào undo; scene schema mở (`type: z.string()` + passthrough,
  scene.ts) nên fabric Path và Group serialize tự nhiên;
  `FabricObject.customProperties` đã gồm name, origin, locked, fontSource,
  recoveredTextLine (packages/canvas/src/editor.ts:29). Fabric 7.4.0.

## 2. Draw (SG-10): cách các editor lớn làm

### 2.1 Nghiên cứu nguồn công khai

| Editor | Cách làm | Nguồn |
| --- | --- | --- |
| tldraw | draw shape lưu ĐIỂM GỐC (raw points + segments), outline tái sinh bằng perfect-freehand mỗi lần render; pressure thật từ pointer events khi có bút | tldraw.dev (Drawing and canvas interactions), github.com/steveruizok/perfect-freehand |
| Excalidraw | element `freedraw` = mảng points (+ tuỳ chọn simulatePressure theo velocity khi không có bút), cũng render bằng perfect-freehand; lưu điểm gốc chứ không lưu polygon | github.com/excalidraw/excalidraw/issues/3500, #4802 |
| Fabric (native) | `isDrawingMode` + PencilBrush: gom điểm, decimate 0,4px, thả chuột tạo ngay `fabric.Path` bezier (quadratic smoothing), fire `path:created`. Không pressure. Path là object fabric chuẩn: select, move, scale, serialize, export như mọi layer | source fabric 7.4.0 trong node_modules (PencilBrush), fabricjs.com docs free drawing |

perfect-freehand (tác giả Steve Ruiz, chính là founder tldraw): hàm
`getStroke(points, options)` trả về outline polygon của nét vẽ nhạy áp
lực; các option chính: `size`, `thinning` (0 = nét đều), `smoothing`,
`streamline`, `simulatePressure` (mặc định true, mô phỏng theo vận tốc),
`start/end.taper` (vót mảnh đầu cuối). MIT, ~5KB, được tldraw và
Excalidraw dùng. Lời ngỏ sponsor cho sản phẩm thương mại là MONG MUỐN,
không phải điều khoản giấy phép.

### 2.2 Best practice rút ra

1. Lưu điểm gốc thay vì polygon khi muốn giữ pressure và restyle về sau
   (cả tldraw và Excalidraw đều làm vậy).
2. Pressure thật chỉ có từ pointer events của bút (`e.pressure`); với
   chuột/trackpad thì mô phỏng theo vận tốc hoặc nét đều (thinning 0).
3. Decimate điểm nhỏ hơn ngưỡng px (fabric: 0,4px) để bớt rác điểm.
4. Chế độ vẽ phải tắt selection và cho phép thoát bằng Esc hoặc đổi tool.
5. Eraser: tldraw/Excalidraw xóa theo stroke giao nhau; fabric không có
   brush eraser builtin, v1 dùng chọn path rồi Delete là đủ cho seller.

### 2.3 Chọn phương án cho Oia

**Phương án A (khuyến nghị v1): hoàn thiện PencilBrush native.**

Lý do: 0 dependency mới; path là object fabric chuẩn nên mọi cơ chế sẵn
có tự tiếp nhận (selection, Layers panel, undo qua object:added, export
PNG/PDF/PPTX/ZIP đều raster hóa qua fabric, các flow AI như image-edit
thấy path như layer thường); đủ cho use case seller (khoanh, gạch chân,
scribble chú thích bằng chuột/trackpad). Giữ nguyên triết lý đã dùng cho
Crop SG-8: dùng đúng năng lực fabric, chỉ wire cho hoàn chỉnh.

Việc cần làm (kèm file):

1. `Editor.tsx`: nghe `canvas.on("path:created")`, với path vừa tạo:
   `stampUser`, đặt `name: "Drawing"`, đảm bảo `strokeUniform: true` để
   scale không méo độ dày. Bỏ chế độ vẽ khi đổi panel, khi bấm Esc, và
   khi người dùng select layer khác.
2. Panel Draw: color picker (dùng lại `ctxColor` pattern của
   ContextToolbar), slider độ dày 2 đến 24 áp vào `freeDrawingBrush.width`
   và `color`; hiển thị trạng thái đang vẽ.
3. Khóa tắt selection khi vẽ: fabric đã tự chặn khi `isDrawingMode`, chỉ
   cần UI nhất quán (con trỏ, nút đổi nhãn Stop drawing như hiện nay).
4. Optional (sau v1, chỉ khi owner dùng Apple Pencil): phương án B nâng
   cấp pressure bằng perfect-freehand, tích hợp đúng chuẩn: capture raw
   points + pressure qua pointer events (tiền lệ capture điểm đã có sẵn
   markup-annotate.ts), `getStroke()` ra outline, dựng `fabric.Path` từ
   SVG path data, LƯU điểm gốc vào customProperties (ví dụ
   `drawnStroke: number[][])` để sau này tái tạo nét với style khác.
   Nhớ cân nhắc lời ngỏ sponsor khi Oia có dòng tiền.

**Gate nghiệm thu SG-10:**

- Shot gate: bật Draw mode (nút đổi nhãn), fire `path:created` với path
  dựng sẵn (fabric cho phép fire event thủ công, gate wiring chứ không
  giả vờ vẽ) → assert: path vào canvas, `origin === "user"`, có name,
  strokeUniform, undo (nút Undo) xóa được path, serialize scene có
  object type "path", loadFromJSON roundtrip giữ path, toDataURL không
  lỗi. Chụp ảnh editor có nét vẽ (`desktop-draw.png`).
- Unit (nếu làm phương án B): hàm thuần points → SVG path data test
  riêng, không đụng fabric.
- REAL-DATA (quy tắc 2026-11-10): chủ máy vẽ thật 2-3 nét bằng trackpad/bút
  trong app dev, kiểm nét mượt + undo + reload project giữ nét; bằng chứng
  screenshot + file project vào docs/private/real-runs/. Mock không thể thay
  được cảm giác nét vẽ.

## 3. Tables (SG-11): cách các editor lớn làm

### 3.1 Nghiên cứu nguồn công khai

| Sản phẩm | Cách làm | Ghi chú |
| --- | --- | --- |
| Canva | Table là container kiểu cell: click ô để gõ, kéo viền cột để resize, nút +/- thêm dòng cột, chọn cả bảng như một đối tượng | quan sát hành vi công khai |
| Figma | Bảng native (ra mắt 2024): cell-based, row/col handles, bảng là một node riêng | changelog Figma |
| PowerPoint / Slides | Bảng native, sửa text tại chỗ từng ô, kéo viền cột | chuẩn UX người dùng quen |
| tldraw | KHÔNG có bảng builtin; cộng đồng nhét bảng HTML (TipTap rich text) vào shape: resize, cell edit qua DOM; blog ghi rõ các hack: tab handler toàn cục, retry async init, rich text trong cell còn hỏng, resize 2 lớp khó chịu | cliftonc.nl/blog/adding-tables-to-tldraw-with-tiptap (9/2025) |
| pptxgenjs v4 | `addTable(rows, options)` xuất bảng NATIVE trong PPTX (đang có sẵn trong repo) | types pptxgenjs local |

Bài học quan trọng nhất từ tldraw: đường HTML-overlay cho bảng trong một
canvas app tạo ra 2 lớp đối tượng không đồng bộ (DOM shape vs canvas
scene), serialization và export rách việc. Với Oia, fabric là renderer
duy nhất và mọi export đều raster hóa qua canvas, nên bảng PHẢI là
objects fabric thật, không overlay.

### 3.2 Chọn phương án cho Oia

**Phương án A (khuyến nghị): Group các (Rect + Textbox) theo grid + bảng
meta trên customProperties.**

Kiến trúc:

- Mỗi ô = 1 `Rect` (fill, stroke) + 1 `Textbox` đặt trong một
  `fabric.Group` toàn bảng, group bật `subTargetCheck: true` để hit-test
  tới từng ô.
- customProperties trên group: `tableMeta: { rows, cols, colWidths[],
  rowHeights[], header: boolean }` (add key vào
  `FabricObject.customProperties` trong packages/canvas/src/editor.ts,
  tiền lệ recoveredTextLine). Schema scene không cần migration (group
  + passthrough đã nhận).
- Sửa ô: click ô (subTarget) hoặc dblclick → `textbox.enterEditing()`,
  thoát editing → auto-grow chiều cao dòng theo nội dung.
- Inspector khi chọn bảng: thêm/xóa dòng, thêm/xóa cột (tái dựng grid từ
  tableMeta, giữ text cũ), sửa border/fill; kéo viền cột là nice-to-have
  v1.1.
- Serialize như group thường, giữ thứ tự z; undo ăn theo object:added /
  object:modified sẵn có.
- Export: mọi đường hiện có tự áp (raster). Lane tương lai (không thuộc
  SG-11): xuất PPTX native table bằng `addTable` từ tableMeta thay vì
  ảnh, chỉ khi có nhu cầu thật.

Các phương án đã loại:

- B: custom class `Table extends fabric.Group` với layout engine riêng:
  API sạch hơn nhưng phải lo class revival khi loadFromJSON, nặng hơn
  phần lợi ích cho use case seller (bảng đơn giản: bảng giá, so sánh
  gói, spec sản phẩm).
- C: HTML overlay kiểu tldraw: loại, lý do ở 3.1.

Việc cần làm (kèm file):

1. `apps/desktop/src/renderer/lib/table-grid.ts` (mới): math thuần
   colWidths/rowHeights → x, y, w, h từng ô + tái dựng group từ tableMeta
   (test thuần không cần fabric cho phần layout math).
2. `Editor.tsx`: thay `insertTable(n)` bằng dựng group theo phương án A;
   dblclick subTarget → enterEditing; inspector (tab Design) nhận diện
   bảng qua tableMeta và hiện các nút thêm/xóa dòng cột.
3. `packages/canvas/src/editor.ts`: thêm `tableMeta` vào
   customProperties.

**Gate nghiệm thu SG-11:**

- Unit: table-grid math (layout 3x3, thêm cột dịch đúng x, auto-grow
  row height khi text dài, tái dựng từ tableMeta giữ text).
- Shot gate: insert 3x3 từ panel Tables → canvas có đúng group với
  9 Textbox; click ô → enterEditing → gõ text (gate set value + event
  như gate typography hiện có) → text vào đúng ô; thêm 1 cột qua
  inspector → số Textbox = 12 và cột cũ không xê dịch; undo; serialize
  roundtrip giữ tableMeta; export PNG không lỗi; chụp
  `desktop-table.png`.
- REAL-DATA (quy tắc 2026-11-10): bảng giá thật của 1 shop (5-8 dòng, tiếng
  Việt có dấu), xuất PPTX và MỞ bằng PowerPoint/Keynote thật để kiểm hiển
  thị; bằng chứng vào docs/private/real-runs/.

## 4. SG-17 (Share/collaborate) và SG-18 (Gallery): ghi ngắn

Hai mục này chờ owner quyết, tài liệu này KHÔNG mở lại chúng, chỉ ghi
hiểu biết để khi owner hỏi thì trả lời có căn cứ:

- **Share/collab**: chuẩn ngành cho đồng thời thật là CRDT (Y.js,
  Automerge) + relay server; Excalidraw collab chạy qua Firebase, Figma
  có server riêng. Tất cả đều cần backend + tài khoản, trái quyết định
  desktop-only (reorg step 6). Lối thoát không server đã có: export gói
  PPTX/PNG/ZIP. Nếu owner mở lại: lập doc design riêng, không code trước.
- **Gallery cộng đồng**: gallery user-generated thật cần auth, kiểm duyệt
  và giấy phép nội dung. Bước trung gian 0 backend đã có tiền lệ trong
  repo: trang curated trên site hiện output thật kèm provenance (xem
  "Grown from real prompts" và docs/verification/marketing-assets.md).
  Nếu owner muốn mở, đề xuất làm curated showcase trước, gallery thật sau.

## 5. Thứ tự và ước lượng

1. SG-10 trước: phần lớn là wire + 1 listener + UI panel, 1 phiên làm xong
   kèm shot gate (phương án A).
2. SG-11 sau: thêm lib math + inspector + dblclick, 1 phiên, gate unit +
   shot.
3. Hai mục độc lập nhau, không chặn SG nào khác. Ưu tiên thấp hơn các mục
   gate mở (SG-1, SG-6) nếu owner xếp lại.

## Cập nhật doc này

Khi triển khai SG-10/SG-11: đánh DONE ở parity TODO kèm commit + gate
theo quy tắc doc đó; doc này giữ làm bản ghi nghiên cứu, ghi thêm lệch
thực tế so với kế hoạch (nếu có).
