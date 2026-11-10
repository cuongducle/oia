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
| Deconstruct (Make text editable) chuỗi đầy đủ | 2026-11-09: 1 đọc + 1 ảnh, ~97s, SSRIM vùng chữ 0,8345 | docs/private/surgepix-feature-audit-2026-11-09/e2e-real/ |
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

## C. Còn mock-only hoặc chưa có gate (việc tiếp theo)

| Mục | Trạng thái | Rủi ro | Việc cần |
| --- | --- | --- | --- |
| Editor export pipeline (PNG/JPG/PDF/PPTX/ZIP qua doExport) | planExport có unit test nhưng pipeline renderer (fabric → jsPDF/pptxgenjs/JSZip → saveExport) KHÔNG có gate nào; comment "accept both module shapes" của pptxgenjs ESM là dấu hiệu mong manh | Cao (5 định dạng, mỗi cái một thư viện) | Shot gate chọn từng format qua dialog export thật + mở file xuất ra bằng consumer thật (Preview/PowerPoint) |
| Loopback agent API với provider thật + skill thật | loopback.test = HTTP thật + ctx mock; skill CLI (oia-ppt-translate) chưa từng chạy qua loopback desktop với key thật | Trung bình (lane agent là mặt bán) | 1 e2e: app thật + key thật + chạy 1 skill CLI end-to-end |
| ME markup-edit generation thật | markup-edit.md ghi "generation thật 1 ảnh chờ duyệt riêng", chưa chạy (image-edit thật hôm nay đi cùng provider path nhưng không phải composite ME) | Trung bình | 1 run khoanh-vùng thật trong app |
| Cancel thật giữa generation codex | crash-gate và guard test là mock; TP-D5 chưa có run cancel thật trên provider thật | Trung bình (tiền + trải nghiệm) | 1 run: submit thật, cancel giữa chừng, xác nhận cây tiến trình chết + record trung thực |
| segment-image trong app đóng gói (SG-1) | Mở, đang làm song song (PoC engine đã thật) | Cao (nút đã ship) | Theo SG-1 ledger |
| Windows máy vật lý | Mọi run thật tới nay là macOS; Windows chỉ CI wiring (D3) | Cao cho claim parity | Chạy bộ real tối thiểu trên 1 máy Windows |
| fal / openai wire providers | Không có lane UI (D18 rút), chưa từng chạy thật | Thấp (không user-facing) | Để nguyên, ghi chú |
| Web .data import (legacy) | Fixtures tự dựng | Thấp (data legacy hiếm) | Nếu có data thật của user, import 1 lần |
| Quota daily-limit hit thật | Meter test dùng clock giả | Thấp (đốt quota để test limit là lỗ) | Giữ synthetic, ghi lý do |

## D. Quota đã tiêu cho các run 2026-11-10 (meter từng report)

planner: 5 (gồm 2 lượt fail phát hiện bug) · image: 8 (1 ảnh input remove-bg,
5 slide presentation, 1 xhs, 1 image-edit). Tổng theo report trong
`docs/private/real-runs/**/report.json`.

## Cách cập nhật

Mỗi feature mới: thêm 1 dòng vào bảng A (kèm đường dẫn bằng chứng) hoặc C (kèm
lý do chưa chạy thật). Khi mục ở C được chạy thật, chuyển lên A, không xóa dòng
lịch sử.
