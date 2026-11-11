---
type: "Reference"
title: "Make text editable: luồng và bản đồ mã nguồn"
description: "Điểm vào, thứ tự xử lý, ranh giới mô-đun và các bất biến khi chỉnh sửa deconstruct."
tags: [desktop, deconstruct, architecture]
status: stable
---

# Make text editable

Quyết định sản phẩm: [desktop-only-reorg.md, D22](../designs/desktop-only-reorg.md#d22-khôi-phục-kiểu-chữ-khi-make-text-editable).
Tài liệu này mô tả cấu trúc, không thay đổi thuật toán hay giới hạn chất lượng.

## Luồng chính

```text
Editor / Workspace: ảnh PNG
  -> tác vụ deconstruct
     -> detector tại máy tìm dòng, tọa độ và góc
     -> AI phân loại chữ thiết kế / chữ trong đồ vật
     -> AI đọc các bảng ảnh cắt đã đánh số
     -> kiểm tra ghép số đầy đủ, mỗi số đúng một lần
     -> đo màu và khung mực từ ảnh gốc
     -> lưu kết quả nhận chữ trước khi làm nền
     -> làm nền tại máy nếu đủ đơn giản, nếu không tạo ảnh một lần
     -> kiểm tra sót chữ, thử sửa cục bộ vùng nền đơn giản
     -> trả nền sạch và thông tin chữ
  -> dựng lớp chữ ban đầu
  -> nhận dạng phông tại máy, so ứng viên với ảnh gốc
  -> đặt chữ bằng phép đo pixel và phép biến đổi chung
  -> mở cảnh trong trình chỉnh sửa
```

Không được cấp detector: nhánh đọc ảnh trực tiếp vẫn hoạt động, rồi nhập
vào cùng bước đo màu/khung và làm nền. Không tự đổi nhánh khi detector lỗi.

## Phần xử lý: `packages/tasks/src/deconstruct/`

| Tệp | Trách nhiệm |
|---|---|
| `processor.ts` | Điều phối, hủy, lưu kết quả trung gian, gọi tạo nền và lưu ảnh |
| `text-detector.ts` | Hợp đồng detector được truyền vào từ desktop |
| `text-reading.ts` | Phân loại, đọc nội dung và ghép đúng số |
| `text-sheets.ts` | Tạo ảnh đánh số và bảng ảnh cắt |
| `source-image.ts` | Đọc PNG có giới hạn kích thước |
| `text-geometry.ts` | Hệ tọa độ của vùng chữ |
| `ink-color.ts` | Đo màu mực |
| `ink-regions.ts` | Tìm phạm vi mực, gồm dấu rời |
| `text-layout.ts` | Chuẩn bị khung vẽ và vùng xóa, gộp vùng xóa |
| `background-plate.ts` | Phục hồi nền đơn giản và ghép nền được tạo |
| `retained-ink.ts` | Kiểm tra nét chữ cũ còn sót |

`processors.ts` vẫn xuất `makeDeconstruct` và kiểu detector như trước.
`deconstruct-plate.ts` và `deconstruct-sheets.ts` chỉ chuyển tiếp các tên cũ
để kịch bản đã ghi và người gọi cũ không bị gãy. Mã sản phẩm mới dùng trực
tiếp mô-đun theo trách nhiệm. `asset-bytes.ts` là phần đọc ảnh kết quả dùng
chung với các tác vụ ảnh khác, được chuyển nguyên hàm cũ, không viết lại.

## Phần giao diện: `apps/desktop/src/renderer/lib/`

- `deconstruct-font-match.ts`: điều phối nhận dạng, chọn phông và dự phòng.
- `font-reference-board.ts`: tạo ảnh cắt, mặt nạ và tập ứng viên phông.
- `font-ranking.ts`: chấm điểm, tối ưu ứng viên, giới hạn thời gian so phông.
- `deconstruct-typography.ts`: đo và đặt chữ, tạo cảnh với lớp chữ sửa được.
- `glyph-raster.ts`: đo mực và phép co giãn dùng chung khi chấm lẫn khi vẽ.
- `deconstruct-scene.ts`: tạo cấu trúc cảnh nền và các lớp chữ.

`font-reference.ts` giữ tên xuất cũ bằng cách chuyển tiếp, không chứa bản
sao thuật toán. Giới hạn so phông vẫn là 15 giây; quá giới hạn giữ bản chữ
ban đầu, không làm mất nền/nhận chữ đã trả phí.

## Bất biến khi sửa

- Detector sở hữu tọa độ trong nhánh có detector; AI phân loại và đọc chữ.
- Sai hoặc thiếu số phải dừng trước lượt trả phí tiếp theo, không tự thử lại.
- Vùng xóa và khung vẽ là hai khái niệm khác nhau, không ép dùng chung.
- Chấm phông và vẽ chữ phải dùng cùng phép đo và biến đổi.
- Tác vụ dừng/lỗi không được khai thành công hoặc mất kết quả nhận chữ đã lưu.
- Refactor không phải nghiệm thu chất lượng: phông xấp xỉ và vệt nền cũ vẫn
  là giới hạn đã ghi ở D22.

Kiểm thử ảnh deconstruct nằm tại
`apps/desktop/src/main/shots/deconstruct.ts`; `main/index.ts` chỉ gọi nó
trong chuỗi shot chung. Các kịch bản shot khác chưa chuyển trong vòng này.
