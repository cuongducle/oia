---
type: Design
title: "Deconstruct quality: hướng tốt nhất cho bài toán khôi phục chữ editable"
description: "Nghiên cứu các hướng trong tài liệu + đề xuất kiến trúc VecFont (truy vết glyph từ ảnh, dựng phông per-line) cho D22, kèm bảng quyết định và metric target."
tags: [design, research, deconstruct, d22]
status: proposal
generated: { by: agent, at: 2026-11-12T00:00:00Z }
---

# Bài toán

Input: poster bán hàng (dày chữ, tiếng Việt). Output: nền sạch + các lớp chữ
EDITABLE trong Fabric (đúng vị trí, kích thước, màu). Hiện trạng đo được bằng
harness metric (`apps/desktop/scripts/deconstruct-metrics.py`, SSIM vùng chữ
theo quy ước paper scene text editing):

| Bản tái tạo | SSIM vùng chữ | IoU mực | Nền lệch >30 |
|---|---|---|---|
| Detector lane run-04-colorfix | 0,397 | 0,237 | 0,26% |
| Lane LLM replay-10 (so phông không trần) | 0,574 | 0,441 | 0,43% |
| Paper SOTA training-free (TextFlow CVPR26) | 0,7-0,9 | n/a | n/a |

Phân rã khoảng cách (từ phân tách sai khác từng crop):

1. **Mực**: phông vẽ khác phông gốc. Đây là phần LỚN NHẤT. Đóng phông
   condensed (Roboto Condensed) nâng lane LLM lên 0,574 nhưng vẫn cách gốc
   một dáng chữ.
2. **Nền trong vùng chữ**: provider vẽ lại nền trong vùng xóa, sai khác cấu
   trúc (~32% pixel nền trong crop lệch >30 ở dòng tệ).
3. **Crop nhỏ** (63x13 px) khuếch đại độ nhạy SSIM.

# Các hướng trong tài liệu, đối chiếu ràng buộc Oia

Ràng buộc: desktop offline-first, sidecar ONNX đã có, phải ra LỚP CHỮ
EDITABLE (không bake), tiếng Việt có dấu, quota vision LLM hạn chế.

## A. Scene text editing bằng generative (TextFlow CVPR26, AnyText, TextCtrl)

TextFlow (training-free, DiT): Attention Boost + Flow Manifold Steering, báo
89,30 SSIM / 22,47 PSNR. Các method này SINH ẢNH mới: chữ bị bake vào pixel,
mất tính editable, mâu thuẫn trực tiếp với mục tiêu D22. Model DiT lớn, không
vào desktop offline; benchmark Anh-centric. **LOẠI** cho sản phẩm, chỉ giữ làm
tham chiếu số liệu.

Nguồn: arxiv.org/abs/2603.24571, openaccess.thecvf.com CVPR2026 Li.

## B. Font matching + bundling (hướng hiện tại, D23b Lens)

Lens phân loại 983 phông Google Fonts + bytes phông OFL đã đi theo scene qua
`fontSource`. Trần chất lượng = tập phông có sẵn; poster thị trường VN thiên
display condensed mà hệ điều hành không có. Đóng thêm 30-60 phông OFL hỗ trợ
tiếng Việt (ước 10-25 MB) + bỏ trần 15 giây (ranking async) nâng ước tính
SSIM lên 0,55-0,65. Còn cách gốc một DÁNG CHỮ. **GIỮ làm tầng nền** (fallback
cho ký tự không quan sát được), không phải đích.

## C. Font vector học (DeepVecFont, VecFontSDF, im2vec)

Synthesize glyph vector từ vài mẫu. Chất lượng cao nhưng là mô hình nghiên
cứu, cần training/tuning theo bộ chữ, nặng cho desktop, và ta KHÔNG cần
synthesize: chữ trong ảnh đã có sẵn glyph. **LOẠI** (overkill), trừ khi sau
này cần sinh ký tự chưa xuất hiện đúng "giọng" phông gốc.

Nguồn: github yizhiwang96/deepvecfont_homepage, arxiv 2303.12675.

## D. Truy vết glyph QUAN SÁT ĐƯỢC + dựng phông per-line (VecFont lane) - ĐỀ XUẤT

Ý tưởng lõi: với mỗi dòng chữ, chữ của dòng đó đã cho ta glyph thật. Truy vết
đường viền glyph từ pixel, dựng thành MỘT file phông nhỏ (chứa đúng các ký tự
của dòng, advance width đo từ ảnh), nạp bằng FontFace, gán vào Textbox.
Kết quả: chữ vẽ ra LÀ glyph gốc (IoU mực mục tiêu ≥0,85/dòng), vẫn editable,
đúng kiến trúc hiện có (fontSource D23b đã persist bytes phông + license theo
scene).

Chuỗi xử lý dự kiến (toàn bộ local, deterministic):

1. DBNet detect + transcribe (đã có).
2. Tách glyph từng dòng: connected components trên mask mực (đã đo được màu);
   nhóm dấu tiếng Việt rời (Ả, ấ...) bằng chồng lấn cột x; các component cùng
   cột = một glyph precomposed.
3. Truy vết viền: marching squares -> đa giác -> Ramer-Douglas-Peucker ->
   fit bezier trơn (kiểu potrace nhưng TỰ VIẾT, xem phần license dưới).
4. Dựng phông: opentype.js (MIT, chạy browser/node) tạo TTF từ path bezier,
   cmap gán unicode theo ký tự transcribe, advance width = khoảng cách đo được.
5. Nạp FontFace "OiaTrace-<lineId>", fontFamily vào Textbox; ký tự người dùng
   gõ thêm mà phông trace không có -> fallback Be Vietnam Pro (khai báo trung
   thực trong note).
6. Giữ nguyên gate hiện có: hình học, màu, bảo toàn nền, metric BÁO CÁO.

Rủi ro đã tính:

- **License Potrace là GPL**: các port npm "potrace" kế thừa. Không nhét vào
  app thương mại. Tự implement tracing (~200-300 dòng TS, thuật toán cổ điển
  marchings squares + RDP + bezier fit), hoặc dùng opencv (Apache-2.0) nếu
  chạy qua sidecar. Glyph truy vết từ ẢNH CỦA USER: sản phẩm là nội dung
  user, không dính license phông gốc (khác chuyện đóng file phông của người
  khác).
- Chữ nhỏ (<16px): viền răng cưa, trace nhiễu; ngưỡng: chỉ trace dòng có chiều
  cao ≥ ~18px, nhỏ hơn dùng tầng B.
- Chữ gradient/nhiều màu trong một glyph: fill phẳng theo màu đo; Fabric hỗ
  trợ gradient fill là nâng cấp sau.
- Chữ nghiêng/nghệ thuật nặng: trace vẫn đúng viền (đây là lợi thế so với
  matching phông).
- Hiệu năng: 44 dòng x ~10 glyph, mỗi glyph ~vài ms trace + dựng TTF ~10ms:
  dưới 1 giây tổng.

## E. Nền vùng chữ: LaMa ONNX local (tầng tách rời)

Sai khác nền trong crop là nguồn SSIM thứ hai. LaMa (big-lama) có port ONNX
Apache-2.0 (Carve/LaMa-ONNX, input 512x512 cố định, ~200 MB fp32). Chạy theo
CROP từng vùng xóa (512 quanh box, không cần cả ảnh) trong sidecar Rust hiện
có. Dùng cho vùng có texture mà local plane hiện tại từ chối, thay hoặc giảm
phụ thuộc provider. Tầng NỀN độc lập với tầng CHỮ, làm sau cũng được.

# Bảng quyết định

| Tầng | Việc | Chi phí | SSIM vùng chữ dự kiến | Trạng thái |
|---|---|---|---|---|
| T0 | Hiện tại (detector + seed fonts + provider plate) | 0 | 0,40 | đã có |
| T1 | Đóng 30-60 phông OFL VN + ranking async bỏ trần 15s | vài ngày, +10-25 MB | 0,55-0,65 | đề xuất làm ngay (nền tảng fallback) |
| T2 | VecFont lane (trace glyph + phông per-line) | 1-2 tuần | mực gần đúng gốc (IoU ≥0,85), SSIM vùng phụ thuộc nền | ĐỀ XUẤT CHÍNH |
| T3 | LaMa ONNX cho nền vùng xóa texture | vài ngày, +200 MB | giảm sai khác nền trong crop | tách rời, làm sau T2 |
| - | Generative STE (bake chữ) | - | - | loại (mất editable) |

# Metric target + gate khi có T2

- IoU mực từng dòng ≥0,85 với dòng được trace (so Stroke-8 mask gốc), ≥0,45
  với dòng fallback phông (từ số lane LLM hôm nay).
- SSIM vùng chữ: BÁO CÁO, không gate (giới hạn khai báo: nền + fallback).
- Gate tự động giữ nguyên: hình học theo dòng, màu đo, bảo toàn nền ngoài mặt
  nạ chữ (fracAbove30 <1%), đo bằng harness metric cho mọi real-run.

# Câu hỏi chờ owner

1. Duyệt T2 (VecFont) làm đích, T1 làm tầng fallback đi kèm?
2. T3 (LaMa +200 MB) có đáng đóng gèm không, hay để provider nền như hiện tại?
3. Chữ nhỏ hơn 18px: chấp nhận fallback phông (T1) thay vì trace nhiễu?

# Nguồn

- TextFlow training-free STE: arxiv.org/abs/2603.24571 (CVPR 2026), báo
  89,30 SSIM / 22,47 PSNR; ghi chú SSIM/PSNR nhạy dịch chuyển + khử răng cưa
  (arxiv 2610.27592).
- DeepVecFont: github.com/yizhiwang96/deepvecfont_homepage; VecFontSDF:
  arxiv 2303.12675; im2vec (CVPR21).
- opentype.js (MIT): github.com/nodebox/opentype.js, tạo font từ path trong
  browser/node.
- Potrace: potrace.sourceforge.net (GPL - lý do phải tự implement tracing).
- LaMa: github.com/advimman/lama (Apache-2.0); ONNX port: huggingface.co/
  Carve/LaMa-ONNX (512x512 cố định).
- Canva Grab Text: canva.com/features/edit-text-in-image (đối thủ tham chiếu:
  tách chữ + font matching, cùng mô hình tầng B).
