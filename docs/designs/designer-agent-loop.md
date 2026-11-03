# DA — Designer Agent loop: research-informed planning + self-improvement

**Ngày:** 2026-11-06
**Trạng thái:** Owner đã chốt 3 câu hỏi mở (2026-11-06 — xem mục "Quyết định owner"); sẵn sàng triển khai theo slices.
**Nguồn quyết định cha:** gap đối thủ trong [`gap-analysis.md`](../private/gap-analysis.md) (mục "lệch thật": agent đọc web) + [`surgepix-reverse-engineering.md`](../private/surgepix-reverse-engineering.md) (RE nội bộ — bằng chứng capture thật, không đoán).
**Ràng buộc cha:** hard rule 6 (quota là tiền — mọi vòng lặp phải bounded + hiển thị chi phí), G2/G3 (không đốt quota cho job doomed; metered-once), B7 (records must not lie — verdict vòng lặp phải persist), D8 (UI EN), D14 (wire additive, không bump schema version).

## Vấn đề

Oia hôm nay là **pipeline một chiều**: planner (1 lượt LLM) → N ảnh → xong. Đối thủ tham chiếu bán "Designer Agent" hai vòng mà Oia chưa có:

1. **Vòng nghiên cứu** — agent của họ "searches the internet, reads pages, then generates visuals from what it finds". Prompt "làm banner giảm giá Halloween 2026 cho shop trà matcha" của họ có dữ liệu/thị hiếu hiện tại; của Oia chỉ có training data cũ của model.
2. **Vòng tinh chỉnh tự động** — kết quả sinh xong được đánh giá và tự sửa tới khi đạt, thay vì bỏ mặc bản đầu tiên cho user tự re-roll.

Cùng lúc đó, điểm yếu đã biết của image model (chính是对 thủ cũng dính — RE §7 bug 1, và D16 rationale) là **chữ render sai/sai ngôn ngữ trong poster mode** — đúng kiểu lỗi mà một vòng self-check bằng vision bắt được.

## Phân tích Designer Agent đối thủ (từ bằng chứng RE, không phải marketing)

| Claim marketing của họ | Thực tế dưới kapô (bằng chứng) |
|---|---|
| "Designer Agent that searches the web" | Planner chạy server-side, có tool search web; kết quả đọc được nhét vào context rồi mới lên prompt ảnh. Không có magic — là 1 lượt planner được cấp tool. |
| "Edit any layer, swap text" (chat trong editor) | Sinh đầu tiên của họ là **ảnh phẳng** (Rect clip + Image full-bleed, RE §3); layers thật đến từ các bước edit sau (extract text / inpaint). "Smart Layer Separation" mạnh hơn thực tế (RE §7 bug 6). |
| Timeline "Designer Agent → Image Generator" | taskMeta node/tool marker trong SSE — reines UI narrative, bản chất là tool calls tuần tự. Oia ĐÃ có protocol y hệt (`[[task::node::]]`, RunSteps). |
| "Agent-callable" (Claude Code/Cursor) | Public API + 15 skills. Oia đã ngang: loopback API (D9) + 15 skills 1-1. |

**Kết luận phân tích:** thứ đáng học là **2 vòng lặp** (research + refine), không phải UI narrative (đã có). Và hai vòng này đều lắp được vào BYOK: codex CLI bundled **đã hỗ trợ web search** (`--search` flag / `web_search` config — có trong rust-v0.166.0 đang pin, nguồn: openai/codex docs `--search` "Enable live web search for the model"), còn vision read đã có sẵn từ B1 (`readImage`). **Zero vendor mới, zero dependency mới.**

## Goals

1. **Research-informed planning:** khi bật, planner chạy với web search; phát hiện được ghi rõ (`researchNotes` trong plan) và nuôi `imagePrompt`/`blocks`. Timeline hiện node "Researching the web" như đối thủ.
2. **Auto refine (self-improvement):** sau khi ảnh sinh, một lượt vision **critic** chấm kết quả theo tiêu chí rõ ràng; fail → refine prompt → sinh lại — **bounded** (mặc định tối đa 1 vòng sửa, hard cap 2), **mặc định BẬT** (owner 2026-11-06), chi phí hiển thị TRƯỚC khi chạy, cancel giữ bản tốt nhất.
3. Mọi vòng lặp **metered đúng 1 lần, nhìn thấy được, trung thực trong record** (số vòng, verdict, bản nào thắng đều persist vào conversation).

## Non-Goals

- Không làm agent tự chủ nhiều bước không metered (mọi ảnh/read đều qua QuotaMeter — không có "agent tự do đốt quota").
- Không để LLM tự quyết định số vòng vượt cap (cap là hằng số code, greppable — follow pattern OC-6).
- Không copy UI/asset/tên đối thủ (ghi chú pháp lý RE §addendum giữ nguyên hiệu lực).
- Không đụng editor edit-agent (A1/A3-lite đã ở nơi đó; "edit whole project" là candidate B2 của brainstorm — doc riêng khi triển khai).
- Không thêm search cho provider không hỗ trợ (capability-gated, không giả vờ).

## Quyết định thiết kế (DA)

| # | Quyết định |
|---|---|
| DA-1 | **Research là MỘT lượt planner có tool, không phải pipeline riêng.** Thay vì thêm stage "search" đứng trước planner (2 lượt LLM), research chạy TRONG lượt planner: `codex exec --search` (bridge thêm flag theo capability) — model tự search/đọc rồi trả plan JSON như thường (`--output-schema` giữ nguyên). Lý do: 1 lần đọc quota thay vì 2; không có state giữa 2 stage phải dọn khi crash; schema output không đổi hình dạng bên ngoài. Phát hiện về lại user qua field mới `researchNotes: string[]` (mỗi mục 1 dòng + nguồn) — vừa là transparency vừa là context mà imagePrompt thừa hưởng. |
| DA-2 | **Capability gate, không fail cứng, không skip lặng lẽ.** `ProviderCapabilities += webSearch: boolean`. codex: `true` (flag `--search`); openai: `true` khi Responses API có web_search (adapter hiện tại chưa có → `false` ở slice 1, bật ở slice sau nếu đáng); mock/fal: `false`. Request `research: true` + provider không có capability → node timeline "Research unavailable on {provider} — generating from the prompt alone" + chạy tiếp (research là enhancer, không phải điều kiện tồn tại của job). Nguyên tắc: capability-gate như TP.11 (`readImage`) — không hỗ trợ thì nói thẳng, không giả vờ có. |
| DA-3 | **Auto refine là vòng đánh-giá→sửa CHẠY SAU ảnh, trước khi yield canvas cuối** (tên UI "Auto refine" — Q3; tên field wire giữ `selfImprove` như hợp đồng, pattern OC-7 giữ `outlineMode`). Critic = `readImage` (B1 vision, đã có) với `EVAL_JSON_SCHEMA` mới: `{verdict: "pass"\|"fail", scores: {text, brand, fidelity, composition}, issues: string[], fixHints: string[]}`. `fail` + còn lượt → 1 lượt planner refine (text-only, nhận plan cũ + issues + fixHints) → 1 ảnh mới → critic lại. Dừng khi: `pass`, hết lượt, critic parse fail, hoặc abort. Bản cuối yield = **bản thắng vòng cuối cùng pass**, hoặc bản tốt nhất theo scores nếu không vòng nào pass. |
| DA-4 | **Bound là hằng số; "Auto refine" mặc định BẬT (owner, 2026-11-06 — ghi đè dự nháp default-off).** `AUTO_REFINE_MAX_ROUNDS_DEFAULT = 1` (tức tối đa 2 ảnh + 2 critic reads cho 1 trang), hard cap `AUTO_REFINE_MAX_ROUNDS_CAP = 2` (schema từ chối giá trị lớn hơn với thông điệp rõ). Default BẬT nghĩa là bill mỗi Create có thể nhân đôi (tối đa 2 ảnh + 2 reads thay vì 1 ảnh) — owner đã cân nhắc và chấp nhận vì chất lượng đầu ra là điểm khác biệt cạnh tranh; đổi lại, cost label (DA-5) là luật hiển thị không thể tắt và switch OFF phải nhớ lựa chọn (localStorage `oia.autoRefine`, pattern OC-6). Hằng số default sống trong code greppable (`AUTO_REFINE_DEFAULT = true`) + test ghim. |
| DA-5 | **Cost label là luật hiển thị** (kế thừa OC-9): Auto refine bật → nhãn cạnh Create: "Auto refine on · up to {N+1} images + {N+1} reads" với N = rounds; tắt → nhãn biến mất. Đa trang: label tính theo trang (N pages × rounds) như C1 đã làm. |
| DA-6 | **B7 — verdict và số vòng persist.** Mỗi vòng critic emit event timeline node (`"Checking round 1"`) + verdict cuối đính vào canvas event thắng cuộc qua `renderData.selfImprove: {rounds: number, verdict: "pass"\|"best-effort", issues: string[]}` (nullable-additive kiểu C1 outline). Conversation replay thấy đúng những gì đã xảy ra — không có bản "tốt lên" không giải thích được đến từ đâu. UI badge trên ResultCard: "auto-refined · round N". |
| DA-7 | **Cancel/gián đoạn giữ bản tốt nhất đã có.** Abort giữa vòng refine = hành vi cancel-giữa-trang hiện có (OC-4): canvas đã sinh vẫn yield + terminal cancelled. Critic fail parse = dừng vòng lặp, giữ bản hiện tại, timeline ghi "check unavailable — keeping this version" (0 đốt thêm; cùng triết lý G2: lỗi của bộ phận phụ không thiêu quota cho bản chính). |
| DA-8 | **Critic chấm theo mode (D16).** Poster mode: tiêu chí `text` nặng nhất (chữ render đúng chính tả + đúng ngôn ngữ prompt — lỗi số 1 của image model, đối thủ cũng dính RE §7.1), rồi brand guidance, fidelity, composition. Clean-plate: bỏ tiêu chí text trong ảnh (chữ là layer native), thay bằng "còn khoảng trống cho blocks tại copy-zones" (đối chiếu `copy-zones.ts`). Trọng số sống trong critic system prompt (một nơi, version cùng planner prompt). |
| DA-9 | **Wire additive kiểu D14:** `chatRequestSchema += research?: boolean, selfImprove?: boolean`; `plannerPlanSchema += researchNotes?: string[]`; `renderData += selfImprove` (nullable, default null); `ProviderCapabilities += webSearch: boolean` (optional-default-false — provider cũ parse được). Không bump `OIA_SCHEMA_VERSION`. |
| DA-10 | **Editor AI dock KHÔNG tự chạy Auto refine** (slice này chỉ Home composer; owner duyệt scope). Edit từng layer đã có cost hint "≈ 1 image"; nhân bản vòng lặp vào dock là follow-up có số liệu sau khi Home chứng minh giá trị. |

## Thiết kế kỹ thuật

- **providers/types.ts:** `ProviderCapabilities.webSearch?: boolean` (default false).
- **providers/codex/bridge.ts:** `CodexExecOptions += search?: boolean` → planner exec thêm `--search` (chỉ đường planner text; ảnh exec không cần). Lưu ý pin: `--search` có trong rust-v0.166.0; nếu bump pin (D12) phải nghiệm lại flag này cùng REAL_SMOKE.
- **providers/llm/codex.ts:** `chat()` opts += search passthrough; capability set `webSearch: true`.
- **schema/plan.ts:** `plannerPlanSchema += researchNotes`; `EVAL_JSON_SCHEMA` + zod parse + `renderDataSchema.selfImprove` (protocol.ts).
- **agent/designer.ts (lõi):** planner system prompt += research chỉ thị khi bật (cho phép dùng search, yêu cầu researchNotes kèm nguồn); sau vòng ảnh (mỗi trang) chạy critic loop theo DA-3/DA-8; narrative node timeline: "Researching the web" → "Creating …" → "Checking round N" → "Refining …". Mock-friendly: critic prompt-aware (mock đọc từ khóa "verdict" trả fail-1-lần-cho-round-0 để test vòng lặp deterministic).
- **services/chat.ts:** pass-through 2 field mới vào designer (schema parse một nơi như cũ); không đổi G3 (vòng lặp nằm TRONG 1 job metered — không mở khóa concurrent).
- **renderer/Home.tsx:** 2 switch (Research · Auto refine) + cost label theo DA-5; ResultCard hiển thị badge "auto-refined · round N" khi `selfImprove.verdict` có. Auto refine: default `AUTO_REFINE_DEFAULT = true` (hằng số greppable + test ghim như OC-6), switch OFF persist `localStorage.oia.autoRefine`.
- **Budget:** BUDGET_MS 480s giữ nguyên cho slice 1 (1 trang × tối đa 2 ảnh + 2 reads ~ vài phút); multi-page + self-improve cùng lúc có thể cần nâng — đo bằng REAL_SMOKE trước khi đổi (đổi budget là quyết định ghi ở đây, không phải con số trong code tự trốn).

## Slices + gates

1. **Slice 1 — Research phase (DA-1/2/9):** bridge flag + capability + planner prompt + researchNotes + UI switch + timeline node.
   Gates: mock golden test (researchNotes deterministic từ mock planner; provider không capability → node "unavailable" + job vẫn complete); REAL_SMOKE owner duyệt (1 poster có thật search — xác nhận codex `--search` chạy qua binary bundled và notes có nguồn thật).
2. **Slice 2 — Auto refine loop (DA-3–DA-8):** critic schema + loop + best-effort selection + persistence.
   Gates (lỗi-path trước, theo test-antipatterns): (a) critic parse fail → dừng, giữ bản, 0 đốt thêm — test unit; (b) cancel giữa vòng refine → canvas bản trước vẫn yield + outcome cancelled — test pin như OC-4; (c) rounds vượt cap bị schema từ chối; (d) verdict persist đúng vào conversation (replay test); (e) cost label xuất hiện khi bật (shot assert) + default-on được test ghim (`AUTO_REFINE_DEFAULT`); (f) REAL_SMOKE owner duyệt: 1 poster chủ đù sai chính tả → kỳ vọng ≥1 vòng refine được ghi.
3. **Slice 3 — openai adapter webSearch (tùy chọn, chỉ khi owner dùng openai làm planner):** Responses API web_search tool. Gate: integration test có key owner.

## Checklist thực thi (theo slices — tick + ghi gate khi xong)

**Slice 0 — Nền schema/provider (chung cho cả 2 vòng)**
- [ ] S0.1 `@oia/schema`: `chatRequestSchema += research?: boolean, selfImprove?: boolean`; `plannerPlanSchema += researchNotes?: string[]`; `renderData += selfImprove` (nullable-additive, kiểu C1 outline); `EVAL_JSON_SCHEMA` + zod parse. Regen `plan.schema.json`. (DA-9, D14 — không bump version)
- [ ] S0.2 `@oia/providers` types: `ProviderCapabilities += webSearch?: boolean` (default false) + test capability parse provider cũ không vỡ.
- Gate: `pnpm build && pnpm test && pnpm typecheck` toàn repo xanh; golden test schema cũ parse được payload mới (D14 hai chiều).

**Slice 1 — Research phase (DA-1/2)**
- [ ] S1.1 `codex/bridge.ts`: `CodexExecOptions += search?: boolean` → thêm `--search` (chỉ lane planner text; ảnh exec không đụng).
- [ ] S1.2 `llm/codex.ts`: `chat()` opts passthrough `search`; capability `webSearch: true`. `llm/openai.ts` / `llm/mock.ts`: `webSearch: false` (slice này).
- [ ] S1.3 `agent/designer.ts`: planner system prompt research chỉ thị (được phép search, bắt buộc `researchNotes` kèm nguồn khi `research` bật) + timeline node "Researching the web"; provider không capability → node "Research unavailable on {provider}…" + chạy tiếp.
- [ ] S1.4 `services/chat.ts`: pass-through `research` (schema parse một nơi).
- [ ] S1.5 `Home.tsx`: switch "Research the web" (default off trong slice này — quyết định default riêng khi có số liệu REAL_SMOKE).
- Gate: mock golden test (researchNotes deterministic); test provider-không-có-capability (node unavailable + outcome completed); **REAL_SMOKE owner duyệt**: 1 poster có search thật qua binary bundled pin (D12: nghiệm `--search` trên rust-v0.166.0 trước khi ghi tested).

**Slice 2 — Auto refine (DA-3–DA-8)**
- [ ] S2.1 Hằng số greppable: `AUTO_REFINE_DEFAULT = true`, `AUTO_REFINE_MAX_ROUNDS_DEFAULT = 1`, `AUTO_REFINE_MAX_ROUNDS_CAP = 2` + schema từ chối rounds > cap + test ghim default-on (pattern OC-6).
- [ ] S2.2 `agent/designer.ts` critic loop: `readImage` + `EVAL_JSON_SCHEMA` chấm theo mode (DA-8); fail + còn lượt → planner refine turn (plan cũ + issues + fixHints) → ảnh mới → critic lại; best-effort selection theo scores; abort-check giữa vòng; timeline "Checking round N" / "Refining…".
- [ ] S2.3 `agent/designer.ts` critic system prompt theo mode: poster — text (chính tả + ngôn ngữ) > brand > fidelity > composition; clean-plate — copy-zones thay text. Một nơi, version cùng planner prompt.
- [ ] S2.4 `llm/mock.ts`: critic prompt-aware (đọc từ khóa verdict → fail 1 lần round 0 để test vòng lặp deterministic).
- [ ] S2.5 B7 persistence: `renderData.selfImprove` trên canvas thắng cuộc + conversation replay giữ verdict + số vòng.
- [ ] S2.6 `Home.tsx`: switch "Auto refine (check & improve)" default BẬT + `localStorage.oia.autoRefine`; cost label luật "Auto refine on · up to {N+1} images + {N+1} reads" (đa trang nhân theo trang).
- [ ] S2.7 `ResultCard`: badge "auto-refined · round N" khi có verdict.
- Gate (lỗi-path trước): (a) critic parse fail → dừng giữ bản + timeline ghi + 0 đốt thêm; (b) cancel giữa vòng refine → canvas bản trước vẫn yield + outcome cancelled (test pin như OC-4); (c) rounds vượt cap → schema từ chối; (d) replay test verdict persist; (e) shot assert cost label + default-on; (f) **REAL_SMOKE owner duyệt**: poster chủ đù sai chính tả → kỳ vọng ≥1 vòng refine được ghi + verdict pass hoặc best-effort trung thực.

**Slice 3 — (tùy chọn, chỉ khi owner dùng openai planner) Responses API web_search** — bỏ qua nếu không có nhu cầu thật.

**Hậu kỳ mọi slice**
- [ ] Cập nhật dòng ledger `SITEMAP.md` (trạng thái DRAFT → ship từng slice).
- [ ] Budget 480s: đo bằng REAL_SMOKE slice 2 (multi-page + auto refine) trước khi đổi — đổi budget là quyết định ghi ở doc này.
- [ ] Đối chiếu `docs/reference/cross-platform-support.md` nếu chạm spawn/CLI args (S1.1 chạm — rà Windows `.cmd` shim không vỡ với flag mới).

## Quyết định owner (2026-11-06)

| # | Hỏi | Chốt |
|---|---|---|
| Q1 | Auto refine mặc định bật hay tắt? | **BẬT** (ghi đè dự nháp default-off — DA-4 đã cập nhật; trade-off bill ghi nhận tại đó). |
| Q2 | Tách "critic provider" riêng để dùng model vision mạnh hơn? | **KHÔNG — dùng đúng provider chat hiện tại** (thường codex/ChatGPT, đã login). Không thêm cấu hình; mở lại chỉ khi số liệu REAL_SMOKE cho thấy critic yếu. |
| Q3 | Tên UI? | **"Auto refine"** — switch label "Auto refine (check & improve)", badge "auto-refined · round N", timeline node "Checking round N". |

## TP / luật bị chạm

- Hard rule 6 + G3: vòng lặp nằm trong 1 job metered; không concurrently; cancel an toàn.
- G2: critic fail = dừng phụ trợ, không thiêu quota chính.
- B7: DA-6 (verdict persist; bản thắng được giải thích).
- TP.11 pattern: DA-2 capability-gate giống readImage.
- OC-9 pattern: DA-5 cost label là luật.
- D14: DA-9 additive-only.
- D12: `--search` phải thuộc cặp pin được test (bump pin ⇒ nghiệm lại).

---

*Cập nhật ledger:* dòng mới ở `SITEMAP.md`. Đối thủ không được nêu tên trong repo công khai theo precedent — tham chiếu qua `docs/private/` (file private, không publish).
