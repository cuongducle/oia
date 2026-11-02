# Selection-bound edits (A3-lite) — what actually rides to the image model

**Ngày:** 2026-11-02
**Trạng thái:** SHIPPED (PR #24 renderer → PR #29 structured; companion của D16 trong `desktop-only-reorg.md`)
**Bối cảnh:** owner chốt lane SurgePix (edit = regenerate giữ style). Câu hỏi mở còn lại: khi user chọn một layer và gửi AI edit, **cái gì thực sự gửi vào codex là tối ưu**? Trả lời bằng 3 vòng thí nghiệm thật trên cặp codex live.

## Hợp đồng wire (đã ship)

```
chatRequestSchema += editMode?: { targetName?: string; textLayerOverlays?: boolean }
Editor (runAiEdit):
  referenceImages = [layer đang chọn] (+ paperclip attachments, cap 4)   ← KHÔNG gửi ảnh khác
  editMode = { targetName: layer.name, textLayerOverlays: trang có text layer riêng? }
designer.ts (buildEditClauses — deterministic, planner không đụng được):
  " Edit Image 1 (the <targetName> layer) only, and return the result at the
    exact same dimensions as Image 1."
  + " Do not add any text or lettering — copy is added as separate layers."
    (chỉ khi textLayerOverlays — plate mọc chữ = double text sau apply)
  — clauses tự bỏ qua khi không có referenceImages (Image 1 sẽ vô danh)
variant card:
  targetLayer bind lúc SEND (first-event-wins như prompt, B7)
  canReplaceVariant gate nút Replace + re-check lúc click — variant vẽ cho
  "artwork" không bao giờ thay "product sticker" (TOCTOU)
```

## Bằng chứng thí nghiệm (3 ảnh quota, owner-approved)

| Vòng | Gửi gì | Kết quả |
|---|---|---|
| v1 | mọi ảnh canvas + snapshot toàn trang, clause trong prompt | model edit theo ref "đầy đủ nhất", **tự chế chữ sale vào nền sạch**. Transcript xác nhận clause sống sót ("Edit Image 1 only. Preserve… dimensions") — lỗi ở ĐÍCH nhập nhằng, không phải câu chữ |
| v2 | 1 ref (layer chọn), banner nướng | repaint đúng, **typography 3D giữ nguyên** (20%→30% verified 8/10) |
| v3 | trang có text layer riêng + lệnh cấm chữ | nền tối hơn, **0 chữ chế thêm**, 0 sticker dán vào, canvas bất động tới Apply |

Bài học: **image model edit bức ảnh "hoàn chỉnh nhất" trong danh sách ref** — đích phải là ảnh DUY NHẤT, khai báo bằng tên, khóa kích thước trong prompt (GPT-Image qua codex không nhận tham số kích thước; clause là cách duy nhất và nó đã giết cảnh báo ratio-mismatch).

## Gates
- agent: 3 test clause (đủ / lock-only / không editMode) + skip-không-ref
- services: boundary schema editMode (strip/reject key lạ)
- variant-tray: bindTargetForJob + canReplaceVariant (painting-for-layer gating)
- prompt-library trên landing ghi rõ "tested" chỉ cho 3 prompt đã chạy thật

## Không làm (ghi nhận trade-off)
- Mask/crop vùng chọn (inpaint thật sự): codex CLI không hỗ trợ mask — crop→edit→dán lại là việc của doc khác nếu có asks thật.
- refs theo thứ tự z thay vì 1-ảnh-đích: đã thử (v1), thua.
