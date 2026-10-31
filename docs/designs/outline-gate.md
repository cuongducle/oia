# C1 — Outline gate: duyệt dàn ý trước khi đốt quota cho deck nhiều trang

**Ngày:** 2026-10-31
**Trạng thái:** ĐÃ IMPLEMENT trên nhánh `a1-preview-apply` (gates xanh — xem cuối doc). Owner duyệt "làm đi" cùng ngày; sequencing v1.1-sớm theo variant-preview-apply.md.
**Nguồn quyết định cha:** [`feature-upgrade-brainstorm.md`](feature-upgrade-brainstorm.md) mục C1 + Q2 (chốt 2026-10-31 sau 2 vòng). Doc này là bản "tốt nghiệp" — chi tiết C1 sống ở ĐÂY từ nay.
**Ràng buộc cha:** G2/G3 (không burn quota khi doomed job; metered-once), B7 (records must not lie), D8 (UI EN), hard rule 6 (quota là tiền).

## Vấn đề

Sinh deck N trang (composer chọn Pages ≥ 2) = đốt N ảnh quota tức thì. Planner chia trang dở / dịch sai ngôn ngữ (đối thủ từng dính — RE §7 bug 1) → tiền cháy trước khi user thấy gì. Đối thủ thấy credit trừ ngay nên không cần gate; Oia đốt quota ChatGPT vô hình → phải chặn TRƯỚC pha ảnh.

## Goals

1. Pha 1 (rẻ): 1 lượt planner text-only trả **pageOutline** — đúng N mục `{title, summary}` (tiêu đề + tóm tắt mỗi trang).
2. **Outline card**: đọc lướt 5 giây + 1 click; sửa tiêu đề/tóm tắt từng trang, thêm/bớt/dời trang ngay tại card; nút chính hiện sẵn "Generate N pages · ≈ N images".
3. **Mặc định BẬT** cho mọi Pages cố định ≥ 2; **switch tắt** nhớ lựa chọn; tắt = chạy thẳng (không pha duyệt).
4. **Nhãn chi phí là luật chung** (độc lập switch): Pages cố định ≥ 2 → "N pages ≈ N images" cạnh nút Create.
5. Pha 2 sinh ảnh **theo đúng outline đã duyệt** — đếm trang sai = fail TRƯỚC khi đốt ảnh nào.
6. Cancel giữa deck: dừng đúng chỗ, trang đã sinh vẫn giữ (đã là hành vi pipeline — giờ có test pin).

## Non-Goals

- Pages "Auto" (hiện là 1 trang — không đổi trong slice này).
- Editor dock (không gửi pages).
- Lưu/resume outline card giữa các lần mở app (card là state của pha chạy; bản ghi conversation vẫn persist outline như mọi event).
- Chỉnh outline của deck ĐANG sinh (chỉ duyệt trước).

## CUJ

1. Seller chọn "3 pages", gõ prompt, bấm Create. Nhãn "3 pages ≈ 3 images" hiện cạnh nút từ lúc chọn.
2. Planner chạy 1 lượt text → outline card hiện: 3 hàng (title + summary editable), nút "Generate 3 pages · ≈ 3 images", "Cancel".
3. Seller sửa tiêu đề trang 2, kéo trang 3 lên, bấm Generate → 3 ảnh sinh tuần tự theo outline; ResultCard + timeline như thường.
4. Hoặc bấm Cancel → card biến mất, KHÔNG ảnh nào bị đốt (phần planner đã dùng 1 lượt đọc — trung thực, không hoàn).
5. Seller tắt switch "Review outline before generating" → lần sau chạy thẳng, nhãn chi phí vẫn hiện.

## Quyết định thiết kế (OC)

| # | Quyết định |
|---|---|
| OC-1 | **Hai pha là HAI chatRun riêng, không phải job treo.** Pha 1 (`outlineGate: true, pages: N`) kết thúc sạch sau outline (outcome mới `"outline"`); pha 2 (`approvedOutline`, cùng `sessionId`) chạy sinh. Giữa 2 pha KHÔNG có gì in-flight → crash/restart không phải dọn job treo; quota-an toàn về cấu trúc. |
| OC-2 | **Đếm trang là hợp đồng cứng 2 chiều:** pha 1 thiếu/sai `pageOutline.length ≠ N` → fail `plan_parse_failed`, 0 ảnh; pha 2 planner trả `imagePrompts.length ≠ N(approved)` → fail trước vòng ảnh, 0 ảnh. Sai lệch đếm không bao giờ đốt quota (G2 mở rộng cho deck). |
| OC-3 | **Pha 2 vẫn đi qua planner** (không tự ghép prompt từ outline trong code): prompt hệ thống nhúng ĐÚNG outline đã duyệt ("implement each page faithfully — do not merge/add/drop/reorder") + khẳng đếm (OC-2). Lý do: prompt-engineering clean-plate/poster sống ở planner; tự ghép = fork logic prompt vào code, mọi thay đổi sau phải sửa 2 nơi. Drift nội dung là "planner hiện thực hóa title/summary", không phải "planner quyết định lại" — ranh giới là đếm trang + chỉ thị cứng. |
| OC-4 | **"N job con" → GIỮ 1 job, N ảnh metered.** Đoạn văn spec chọn cơ chế N job để đạt: cancel dừng đúng chỗ + trang đã sinh giữ. Pipeline ĐÃ có cả hai (abort-check giữa trang, canvas yield tuần tự, QuotaMeter đếm từng ảnh). Tách N job = lớp orchestration mới trên runChat mà không đổi quan sát được của user. **Ghi nhận là lệch CHỮ, giữ Ý** — test mới pin cancel-giữa-trang. |
| OC-5 | **Wire additive (D14-style):** `chatRequestSchema` += `outlineGate?: boolean`, `approvedOutline?: {title; summary}[]`; `ChatOutcome` += `"outline"`; `renderData` += `outline` (nullable, default null); `plannerPlanSchema` + `PLAN_JSON_SCHEMA` += `pageOutline` (regen plan.schema.json — codex `--output-schema` nhận tự động). Không bump version nào. |
| OC-6 | **Switch là preference UI, sống ở localStorage** (`oia.outlineGate`), default BẬT là HẰNG SỐ trong code (`OUTLINE_GATE_DEFAULT = true`) — spec decision phải greppable. Không đưa vào store (không phải record, tránh phình store cho 1 boolean). |
| OC-7 | **Switch cũ "Create an outline first" (outlineMode) bị THAY ở composer** bằng switch mới "Review outline before generating". Trường `outlineMode` sống nguyên trên wire (skills vẫn gửi được; designer vẫn in bullets như cũ) — không phá hợp đồng. |
| OC-8 | **Ghim session qua 2 pha** (tái dùng `sessionId` return của A1/VA-9): stub outline + deck cuối nằm trong MỘT conversation, "Recent" không sinh bản rác. |
| OC-9 | **Cost label là luật hiển thị**, không phải tính năng của gate: hiện khi Pages cố định ≥ 2 bất kể switch. |

## Thiết kế kỹ thuật

- **@oia/schema:** `planPageSchema {title, summary}`; `plannerPlanSchema.pageOutline`; `PLAN_JSON_SCHEMA.pageOutline` (strict-required pattern: `required` + nullable); `renderDataSchema.outline`; regen `plan.schema.json` qua script sẵn.
- **agent/designer.ts:** input += `outlineGate`, `approvedOutline`. Planner system prompt: pha 1 yêu cầu `pageOutline[]` ĐÚNG N; pha 2 nhúng outline đã duyệt + "Produce exactly N imagePrompts". Sau parse: pha 1 validate + emit outline event (renderData.outline) + đóng node + `</Content>` + return TRƯỚC vòng ảnh; pha 2 khẳng đếm imagePrompts. Giữ nguyên abort-check giữa trang (OC-4).
- **services/chat.ts:** schema += 2 field; outcome `"outline"` khi request có gate và outline đã emit (theo cờ đếm từ event loop, không đánh hơi content); pass-through vào designer.
- **providers/llm/mock.ts:** mock planner thành prompt-aware (đọc "EXACTLY N entries" → trả pageOutline N mục deterministic; đọc "Produce exactly N imagePrompts" → trả N prompt) — cùng triết lý mock ảnh theo prompt.
- **renderer/lib/outline-card.ts (thuần + test):** `editPage/removePage/addPage/movePage` trên `OutlineRow[]`; constraint 1..9.
- **Home.tsx:** state `outlineDeck: {rows, base} | null` (`base` = snapshot submit gốc để pha 2 gửi lại đủ controls); card UI; switch mới (localStorage); cost label cạnh Create; sessionId pin; outcome "outline" → hiện card; Generate → chatRun pha 2 với rows hiện tại.
- **shot:** Pages=2 → submit → card 2 hàng → sửa 1 title → Generate → 2 canvas event → ResultCard. Đủ cả pha lỗi? (gate validation fail là test unit mock; shot giữ happy path + switch assert default-on).

## TP / luật bị chạm

- **G2 mở rộng:** planner-trừuợng abort trước ảnh giờ gồm CẢ sai đếm trang (2 hướng).
- **B7:** pha 1 không sinh ảnh → không có record ảnh; conversation stub ghi đúng nội dung outline đã trả (append sẵn có). Cancel card = không burn gì thêm — không có "refund" giả.
- **D8:** chuỗi UI mới EN ("Review outline before generating", "Generate N pages · ≈ N images", "Cancel").

## Gates (đã chạy 2026-10-31)

1. ✅ schema 14 test (4 mới: pageOutline parse đủ/thiếu/rỗng/legacy).
2. ✅ agent 42 test (6 mới: pha 1 không gọi ảnh; sai đếm pha 1 fail + 0 ảnh; 1 trang không vào gate; pha 2 sinh đủ N; sai đếm pha 2 fail + 0 ảnh; **cancel sau trang 1/3 không gọi trang 2, trang 1 đã yield — pin OC-4**).
3. ✅ services 24 test (3 mới: outcome "outline" + 0 canvas trên wire; pha 2 ghim cùng session 4 messages; 1 trang chạy bình thường).
4. ✅ providers 82 test (3 mới: mock planner nhận thức instruction — EXACTLY N / N prompts / legacy).
5. ✅ desktop 124 test (10 mới outline-card: ops biên 1..9, validity, cost label một nguồn, pref round-trip + garbage + throwing storage).
6. ✅ **Shot (exit 18):** switch default-ON + nhãn "· 2 pages ≈ 2 images" cạnh Create → pha 1 card 2 hàng + **result canvas Ẩn (0 ảnh trong lúc duyệt)** → sửa title → snap `desktop-outline.png` CÓ card → Generate → deck canvas hiện. Vision verify card render + nút đọc được (không trắng-trên-trắng).
7. ✅ `pnpm build && test && typecheck` toàn repo xanh.

**Phát hiện khi làm:** (1) pha 2 phải chốt `pagesWanted` theo approvedOutline TRƯỚC khi dựng planner prompt — không thì instruction "exactly N imagePrompts" không bao giờ vào prompt (test bắt được); (2) hành vi có sẵn: `runChat` finally mutate event cuối thành `id:"final"` cho bản ghi persist — test đếm trang phải loại id này (không phải bug, nhưng ai viết gate cho deck cần biết).

## Rủi ro / cạnh đã nghĩ

- **Planner trả outline kém (tiêu đề chung chung):** user sửa ngay tại card — đó chính là điểm của gate; không thêm bước "regenerate outline" (exit code của D10 sẽ nói có cần không).
- **Hai lượt planner mỗi deck (pha 1 + pha 2):** chi phí 1 lượt đọc thêm — giá của quyền duyệt; switch tắt là lối thoát hợp pháp.
- **Phase 2 planner paraphrase drift:** chấp nhận ở mức hiện thực hóa (OC-3); nếu D10 cho thấy drift thật sự gây khiếu nại → mới cân nhắc deterministic-prompt.
