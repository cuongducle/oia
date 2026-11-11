---
type: "Verification Record"
title: "Real-data coverage matrix"
description: "Trạng thái chạy data thật (provider thật, file thật, model thật) của toàn bộ tính năng; lượt quét đầu tiên 2026-11-10 sau khi owner phê quy tắc real-data trong AGENTS.md."
tags: [verification, real-data, coverage]
status: stable
generated: { by: agent, at: 2026-11-10T00:00:00Z }
---

# Ma trận real-data coverage

Luật (AGENTS.md, owner 2026-11-10): mọi feature user-facing kèm cả gate mock LẪN
chạy data thật, bằng chứng trong `docs/private/real-runs/`. Doc này là bản quét
toàn diện đầu tiên: cái gì đã chạy thật, cái gì còn mock-only, bug thật nào bị
bắt nhờ chạy thật.

## A. Đã có chạy thật (kèm bằng chứng)

| Tính năng | Chạy thật | Bằng chứng |
| --- | --- | --- |
| Chat + generate banner (runChat, generate-poster) | REAL_SMOKE thật (D12, 2026-11-07, events=10) + DA gates (2026-11-06) | desktop-only-reorg.md D12, designer-agent-loop.md |
| Deconstruct (Make text editable) chuỗi đầy đủ | Mẫu 2026-11-09 đã chạy thật, không đại diện ảnh dày chữ. **2026-11-11: ca ảnh owner 1254x1254 FAIL chất lượng khi mở ảnh trực tiếp. WIP sửa, chưa nghiệm thu.** Bốn task thật (13 đọc + 4 ảnh); replay đầu ra đã lưu qua code mới vẫn có lệch/chồng chữ và sai phông. Build/test/typecheck/smoke/crash-smoke/shot xanh không phủ nhận lỗi chất lượng này. | docs/private/surgepix-feature-audit-2026-11-09/e2e-real/ + docs/private/real-runs/2026-11-11-deconstruct-fix/ |
| Deconstruct detector, kiểm lại sau khi owner bác kết quả | run-03-local bị loại: đếm màu báo đạt giả. run-04-crops thêm 2 đọc thật, không tạo ảnh; replay-10-residual dùng nền run-02, sửa nội dung và renderer đo dấu/chữ nghiêng. Đã mở nền + bản dựng: hết chồng chữ nặng, phông/độ đậm vẫn khác. 45 lớp sau loadFromJSON lệch tối đa 2px so với hộp trích, không chứng minh hộp đúng hoàn toàn. **Vòng sửa 2026-11-12 sau review: bỏ nhánh LLM tọa độ, gate hết chữ đo tương phản biên (chữ đổi màu nhẹ bị bắt), hai nhánh nền cùng một gate, ranker + renderer dùng chung raster/biến đổi (hết kéo méo chữ 2,5x), ngân sách 15 giây cho so phông. Gate pixel text-smoke lặp lại được chạy CI Ubuntu+Windows; 9 script bị bác lưu rejected-source/. Còn mở: DBNet sidecar, bộ ảnh đối chiếu độc lập, Windows máy thật.** | real-runs/2026-11-11-deconstruct-detector/RECHECK.md + rejected-source/ + replay-10-residual/ |
| match-fonts (LLM chọn phông) + recognize-fonts (Lens local) | 2026-11-09: match-fonts thật qua Codex thành công; Lens chạy thật từ D23b | cùng thư mục audit, quality-local/ |
| Auto-refine critic (readImage thật) | DA-REFINE 2026-11-06: 221s, 2 vòng, verdict thật | designer-agent-loop.md |
| ppt-translate | 2026-11-10: 2 chiều (EN→VI 6,3s, VI→EN 5,8s), deck python-pptx thật, output mở bằng python-pptx | real-runs/2026-11-10-ppt-translate/ |
| remove-background | 2026-11-10: rembg CLI thật + ảnh sản phẩm generate quota thật | real-runs/2026-11-10-remove-bg/ |
| crop | 2026-11-10: crop.ts production + fabric trong Chromium thật trên ảnh thật | real-runs/2026-11-10-crop/ |
| generate-presentation | 2026-11-10: 5 slide thật, 219s, output pptx 5 ảnh mở được | real-runs/2026-11-10-sweep/presentation/ |
| generate-xhs-images (đại diện generic image tasks) | 2026-11-10: 68,6s, 1 ảnh 1024x1365 | real-runs/2026-11-10-sweep/xhs/ |
| image-edit (AI Hairstyle / Edit with AI lane task) | 2026-11-10: 54,5s, reference ảnh thật | real-runs/2026-11-10-sweep/image-edit/ |
| image-translate | 2026-11-10: xác nhận fail trung thực capability_unsupported, 0 quota (đúng chủ đích) | real-runs/2026-11-10-sweep/image-translate/ |
| Segmentation engine (SAM 3 ONNX local) | PoC offline thật: IoU 0,994 vs PyTorch BF16 (nhưng e2e trong app đóng gói vẫn là SG-1, đang làm) | poc-local-segment/RESULTS.md |
| Editor export pipeline (PNG/JPG/PDF/PPTX/ZIP) | 2026-11-10: shot gate mới chạy đủ 5 format qua doExport thật, magic bytes + pptx là archive thật có slides; artifact size ghi trong log shot | main/index.ts export gate + shot log |
| Loopback agent API + skill CLI thật | 2026-11-10: oia-ppt-translate skill chạy end-to-end qua loopback + key thật + codex thật (8,5s, download 30KB, agentJob events lane agent) | real-runs/2026-11-10-loopback-skill/ + harness scripts/loopback-skill-real.mjs |
| Cancel giữa generation codex (TP-D5) | 2026-11-10 qua lane guard loopback: record failed/cancelled trung thực, cây tiến trình codex chết (1→0), slot nhả ngay (submit kế tiếp 11ms, không 429) | real-runs/2026-11-10-cancel/ + harness scripts/cancel-real.mjs |
| ME markup-edit (khoanh để sửa, flatten) | 2026-11-10: composite bằng markupComposite PRODUCTION trong Chromium thật (marker đỏ 2,99%) + runChat PRODUCTION editMode.markup=flatten trên cặp codex thật (45,7s, 1 planner + 1 image, outcome completed); output không còn marker (0,001%), ảnh đổi 78,3% đúng yêu cầu marble | real-runs/2026-11-10-markup-edit/ |

## B. Bug thật chỉ chạy thật mới bắt được (ngày 2026-11-10, cả 3 đã fix kèm test)

1. **chat() ép schema poster plan**: `CodexLlmProvider.chat()` luôn pin
   `PLAN_JSON_SCHEMA`; provider thật trả shape sai → `plan_parse_failed 0/8` ở
   ppt-translate. Mock trả mọi shape nên không bao giờ thấy. Fix: `opts.schema`
   của caller (cơ chế readImage mở rộng). Ảnh hưởng: ppt-translate,
   generate-presentation.
2. **Dialect schema của codex response_format**: mọi property phải nằm trong
   `required`, key tùy chọn bị 400 `invalid_json_schema`. Fix OUTLINE_JSON_SCHEMA
   + test lint mọi schema gửi codex.
3. **image-edit nhận reference `/api/files/`**: provider không hiểu URL
   same-origin của shell → ENOENT thật; mock chấp nhận hết. Fix: processor resolve
   qua store sang local path (tiền lệ platePath của deconstruct). Ảnh hưởng: UI
   AI Hairstyle, tool Edit with AI, skill lane.

Bài học chung: cả 3 lỗi đều nằm ở BIÊN giữa shell và provider thật, đúng lớp mock
không mô phỏng được. Đó là lý do quy tắc real-data tồn tại.

4. **Output shape của 13 skill khi submit sync-mode**: submit noWait:true qua
loopback chỉ trả `{taskId, progress}` (không taskResult), skill in output thiếu
`download` mà SKILL.md hứa. Tất cả 13 skill đã vá: luôn GET bản ghi cuối trước
khi in. Bắt được nhờ e2e loopback + skill thật.

Ghi chú harness ME (2026-11-10): chạy runChat trong ELECTRON MAIN bị treo giữa
chừng (không chẩn đoán được, main process + spawn); bản chạy production code
trong node thuần hoạt động. Production thật chạy runChat trong UTILITY process
(đã được chứng minh bằng mọi REAL_SMOKE chat thật), nên hiện tượng treo là của
harness main-process, không phải của lane sản phẩm. Lần đầu dựng composite
harness truyền điểm dạng mảng thay vì `{x,y}` nên nét vẽ NaN im lặng: lỗi
harness (production UI luôn truyền đúng shape, TS chặn ở compile), nhưng là
bài học canvas NaN âm thầm đáng nhớ.

## C. Còn mock-only hoặc chưa có gate (việc tiếp theo)

| Mục | Trạng thái | Rủi ro | Việc cần |
| --- | --- | --- | --- |
| Mở file export bằng consumer thật (PowerPoint/Keynote/Preview) | Gate mới kiểm magic bytes + cấu trúc archive; chưa ai mở file xuất ra bằng app thật | Thấp-trung | Owner mở 1 lần bộ file trong shot-export hoặc real-runs |
| segment-image trong app đóng gói (SG-1) | Mở, đang làm song song (PoC engine đã thật) | Cao (nút đã ship) | Theo SG-1 ledger |
| Windows máy vật lý | Mọi run thật tới nay là macOS; Windows chỉ CI wiring (D3) | Cao cho claim parity | Chạy bộ real tối thiểu trên 1 máy Windows |
| fal / openai wire providers | Không có lane UI (D18 rút), chưa từng chạy thật | Thấp (không user-facing) | Để nguyên, ghi chú |
| Web .data import (legacy) | Fixtures tự dựng | Thấp (data legacy hiếm) | Nếu có data thật của user, import 1 lần |
| Quota daily-limit hit thật | Meter test dùng clock giả | Thấp (đốt quota để test limit là lỗ) | Giữ synthetic, ghi lý do |

## D. Quota đã tiêu cho các run real (meter từng report)

ĐÍNH CHÍNH 2026-11-13: mục này từng ghi "planner 5, image 8" lấy giữa ngày rồi
không cập nhật, sai so với thực tế cuối ngày. Số chính xác theo từng report là
chuẩn (một số report bị lần chạy sau ghi đè, tổng từ report là CẠN DƯỚI). Tính
lại bất cứ lúc nào:

```bash
python3 -c "
import json, glob
tp = ti = 0
for f in glob.glob('docs/private/real-runs/**/report.json', recursive=True) + glob.glob('docs/private/real-runs/**/result.json', recursive=True):
    q = (json.load(open(f)).get('quota') or {}).get('session', {})
    tp += q.get('planner', 0); ti += q.get('image', 0)
print('planner >=', tp, 'image >=', ti)"
```

Mốc 2026-11-13: planner >= 6, image >= 13 (theo report còn lưu; bỏ qua phần
bị ghi đè). Trong đó các lượt FAIL là các lượt bắt được bug, xem mục B.

## Cách cập nhật

Mỗi feature mới: thêm 1 dòng vào bảng A (kèm đường dẫn bằng chứng) hoặc C (kèm
lý do chưa chạy thật). Khi mục ở C được chạy thật, chuyển lên A, không xóa dòng
lịch sử.
