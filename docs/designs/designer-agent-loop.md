# DA — Designer Agent loop: research-informed planning + self-improvement

**Ngày:** 2026-11-06
**Trạng thái:** Slices 0/1/2 ĐÃ SHIP + **REAL_SMOKE XANH trên cặp thật, chạy 2 LẦN (2026-11-06; lần 2 sau teardown): DA_RESEARCH giờ là job COMBINED (research+refine) OK 72s · DA_REFINE OK-REFINED 155s rounds=1 pass assetBytes 2,2 MB · pair-check OK 43s. Research default BẬT (owner). Budget chốt: `480s + pages × rounds × 150s` (hàm thuần `chatBudgetMs`, test ghim).** Slice 3 (openai webSearch) chỉ làm khi owner dùng openai planner.
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
- [x] S0.1 `@oia/schema`: `chatRequestSchema += research?: boolean, selfImprove?: boolean`; `plannerPlanSchema += researchNotes?: string[]`; `renderData += selfImprove` (nullable-additive, kiểu C1 outline); `EVAL_JSON_SCHEMA` + zod parse. Regen `plan.schema.json`. (DA-9, D14 — không bump version)
- [x] S0.2 `@oia/providers` types: `ProviderCapabilities += webSearch?: boolean` (default false) + test capability parse provider cũ không vỡ.
- Gate: ✅ `pnpm build && pnpm test && pnpm typecheck` toàn repo xanh (schema 25, agent 66, services 38, desktop 137 test); golden test schema cũ parse được payload mới (D14 hai chiều — plan.test.ts "stays optional + nullable" + providerCapabilitiesSchema legacy parse).

**Slice 1 — Research phase (DA-1/2)**
- [x] S1.1 `codex/bridge.ts`: `CodexExecOptions += search?: boolean` → thêm `--search` (chỉ lane planner text; ảnh exec không đụng).
- [x] S1.2 `llm/codex.ts`: `chat()` opts passthrough `search`; capability `webSearch: true`. `llm/openai.ts` / `llm/mock.ts`: `webSearch: false` (slice này).
- [x] S1.3 `agent/designer.ts`: planner system prompt research chỉ thị (được phép search, bắt buộc `researchNotes` kèm nguồn khi `research` bật) + timeline node "Researching the web"; provider không capability → node "Research unavailable on {provider}…" + chạy tiếp.
- [x] S1.4 `services/chat.ts`: pass-through `research` (schema parse một nơi).
- [x] S1.5 `Home.tsx`: switch "Research the web" — **default BẬT (owner chốt 2026-11-06 sau khi có số liệu REAL_SMOKE: +7s/job, notes kèm nguồn — ghi đè dự nháp default-off của S1.5)**; switch OFF nhớ lựa chọn (localStorage, pattern OC-6).
- Gate: ✅ mock golden test (researchNotes deterministic từ matcher `PLANNER_INSTRUCTIONS.research`); test provider-không-có-capability (node unavailable + outcome completed, self-improve.test.ts); **REAL_SMOKE owner duyệt: ✅ ĐÃ CHẠY 2026-11-06** — `DESKTOP_REAL_SMOKE_DA_RESEARCH OK outcome=completed notes=1 sourced=1 researchNode=1 no-error took=52s` (jobId a6e96e79) — `--search` chạy thật qua binary bundled pin, notes kèm nguồn thật. **Bug thật gate này bắt được (mock KHÔNG THỂ bắt: mock không spawn codex): `--search` là flag TOP-LEVEL — `codex exec … --search` thoát non-zero ngay (phân loại `unknown`); đúng dạng `codex --search exec …`. Bridge đã sửa (unshift trước subcommand). Bài học: gate mock xanh không chứng minh gì về argv của CLI thật — được nghiệm đúng nhờ owner duyệt quota thật.**

**Slice 2 — Auto refine (DA-3–DA-8)**
- [x] S2.1 Hằng số greppable: `AUTO_REFINE_DEFAULT = true`, `AUTO_REFINE_MAX_ROUNDS_DEFAULT = 1`, `AUTO_REFINE_MAX_ROUNDS_CAP = 2` + schema từ chối rounds > cap + test ghim default-on (pattern OC-6).
- [x] S2.2 `agent/designer.ts` critic loop: `readImage` + `EVAL_JSON_SCHEMA` chấm theo mode (DA-8); fail + còn lượt → planner refine turn (plan cũ + issues + fixHints) → ảnh mới → critic lại; best-effort selection theo scores; abort-check giữa vòng; timeline "Checking round N" / "Refining…".
- [x] S2.3 `agent/designer.ts` critic system prompt theo mode: poster — text (chính tả + ngôn ngữ) > brand > fidelity > composition; clean-plate — copy-zones thay text. Một nơi, version cùng planner prompt. **Nâng cấp v2 (owner 2026-11-03: "critic pro như designer") sau khi 2 real run liên tiếp pass ngay vòng 0 với copy tiếng Việt — critic cũ khen dễ. v2: (1) score bands có anchor 9-10/7-8/4-6/0-3, (2) luật lấy điểm THẤP khi phân vân (anti-leniency — nghiên cứu LLM-judge: anchor + strictness calibration là 2 cách giảm variance đầu tiên), (3) TRANSCRIBE-first — bắt buộc đọc từng ký tự chữ trong ảnh (kể cả dấu tiếng Việt) TRƯỚC khi chấm — nhắm thẳng vào lỗi số 1 của image model (D16/RE §7.1), (4) ngưỡng verdict determinist: pass ⟺ mọi score ≥ 7 VÀ không critical defect, (5) issues evidence-first (thấy gì, ở đâu), fixHints chỉ sửa đúng chỗ hỏng. Wire contract EVAL_JSON_SCHEMA không đổi.**
- [x] S2.4 `llm/mock.ts`: critic prompt-aware (đọc từ khóa verdict → fail 1 lần round 0 để test vòng lặp deterministic).
- [x] S2.5 B7 persistence: `renderData.selfImprove` trên canvas thắng cuộc + conversation replay giữ verdict + số vòng.
- [x] S2.6 `Home.tsx`: switch "Auto refine (check & improve)" default BẬT + `localStorage.oia.autoRefine`; cost label luật "Auto refine on · up to {N+1} images + {N+1} reads" (đa trang nhân theo trang).
- [x] S2.7 `ResultCard`: badge "auto-refined · round N" khi có verdict.
- Gate (lỗi-path trước): ✅ (a) critic parse fail → dừng giữ bản + timeline ghi + 0 đốt thêm (self-improve.test.ts, cả nhánh critic throw); ✅ (b) cancel giữa vòng refine → canvas bản trước vẫn yield + stream abort không `</Content>` (pin như OC-4); ✅ (c) rounds vượt cap → schema từ chối ở BOUNDARY (chat-service.test.ts, 0..2 pass / 3 fail); ✅ (d) replay test verdict persist (runChat mock pair → session lưu `renderData.selfImprove {rounds:1, verdict:"pass"}`); ✅ (e) shot assert cost label + default-on + switch-off nhớ lựa chọn (gate DA exit 23/24 trong shot; badge "auto-refined · round 1" hiện trên ResultCard — toàn kịch bản chạy qua UI thật); ✅ best-effort selection (candidate điểm cao thắng, issues ghi đúng); ✅ mock pair chạy trọn vòng lặp trong smoke/shot (2 ảnh + 2 reads). **(f) REAL_SMOKE owner duyệt: ✅ ĐÃ CHẠY 2026-11-06** — `DESKTOP_REAL_SMOKE_DA_REFINE OK-REFINED outcome=completed rounds=2 verdict=best-effort checks=3 issues=2 no-error took=221s` (jobId f5ef7731) — vòng lặp chạy TRỌN trên cặp thật: critic đọc ảnh thật 3 lần, 2 lượt refine planner + 2 ảnh tái sinh, verdict `best-effort` trung thực (critic vẫn bắt lỗi chữ Việt dài ở cả 3 ứng viên — đúng điểm yếu đã biết D16/RE §7.1; bản thắng = điểm cao nhất, issues=2 ghi thẳng vào record). Quyết định owner Q2 (critic = provider hiện tại) giữ nguyên — critic thật đang LÀM VIỆC (bắt được lỗi thật), chưa có bằng chứng cần tách model vision riêng.

**Slice 3 — (tùy chọn, chỉ khi owner dùng openai planner) Responses API web_search** — bỏ qua nếu không có nhu cầu thật.

**Hậu kỳ mọi slice**
- [x] Cập nhật dòng ledger `SITEMAP.md` (trạng thái DRAFT → SHIP slices 0–2, REAL_SMOKE đã chạy xanh).
- [ ] Budget 480s: **số liệu thật đầu tiên (2026-11-06): 1 trang × rounds=2 = 221s (trong 480s); multi-page (3–9 trang) + refine chắc chắn vượt 480s.** Đổi budget là quyết định ghi ở doc này — cần số liệu multi-page thật hoặc owner chốt số mới (đang chặn bằng UI: deck + auto refine vẫn chạy nhưng có thể dở because budget abort giữa chừng giữ bản tốt — trung thực nhưng nên nâng).
- [x] Đối chiếu `docs/reference/cross-platform-support.md` nếu chạm spawn/CLI args (S1.1 chạm — rà Windows `.cmd` shim không vỡ với flag mới).

## Quyết định owner (2026-11-06)

| # | Hỏi | Chốt |
|---|---|---|
| Q1 | Auto refine mặc định bật hay tắt? | **BẬT** (ghi đè dự nháp default-off — DA-4 đã cập nhật; trade-off bill ghi nhận tại đó). |
| Q2 | Tách "critic provider" riêng để dùng model vision mạnh hơn? | **KHÔNG — dùng đúng provider chat hiện tại** (thường codex/ChatGPT, đã login). Không thêm cấu hình; mở lại chỉ khi số liệu REAL_SMOKE cho thấy critic yếu. |
| Q3 | Tên UI? | **"Auto refine"** — switch label "Auto refine (check & improve)", badge "auto-refined · round N", timeline node "Checking round N". |
| Q4 | Nâng critic prompt v2 (sau 2 real run pass vòng 0 dễ dàng)? | **LÀM (owner 2026-11-03)** — anchor bands + transcribe-first + anti-leniency + ngưỡng 7+/critical-defect; schema giữ nguyên. Trade-off đã cân: critic ngặt hơn = nhiều job đi 1 vòng refine hơn (+1 ảnh +1 read mỗi trang, đã nằm trong bound DA-4). |
| Q5 | v3: generalize rubric theo chuẩn cộng đồng designer? | **LÀM (owner 2026-11-03: "tham khảo từ cộng đồng designer, làm generalize")** — v2 còn vựng từ banner bán hàng (offer > product > decor, thumbnail). v3 đưa checklist phê bình chuẩn ngành: C.R.A.P. (Robin Williams, The Non-Designer's Design Book — contrast/repetition/alignment/proximity), Gestalt figure-ground, squint test cho hierarchy; hierarchy tổng quát “primary message > secondary > supporting theo intent của brief”; legibility gắn với “kích thước tiêu thụ thật” từ brief thay vì thumbnail cố định. Nguồn: lewisu.edu/CRAP, designlab.wisc.edu, gestalt/figure-ground (Smashing Magazine), LLM-judge anchor calibration. |

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

## Defects do vòng lặp/săn asset phát hiện (2026-11-03)

| # | Defect | Bằng chứng | Xử lý |
|---|---|---|---|
| DEF-1 | **`fitCoverWithZones` crop trái poster mode** — chính sách anchor-phải (viết cho clean-plate, chữ vùng top+right) bị áp cho poster (chữ nướng khắp ảnh): codex trả ảnh 4:5 (1122×1402) cho canvas 2:3 (1360×2048) → cropX=191 ăn mất "BL"/"GI"/"2"/"H" của banner ĐÃ render đúng (critic in-app transcribed "all four lines match" trên ảnh gốc). Critic không thể bắt vì nó chấm artifact TRƯỚC khi place. Mock không bao giờ dính (ảnh đúng ratio — branch crop không chạy), chỉ real pair lộ. | session record: cropX 190.98 + selfImprove issues; standalone critic v3 chấm canvas render bắt đúng từng dòng hỏng | **FIX**: `fitCoverWithZones` nhận `mode` — poster crop GIỮA, clean-plate giữ anchor (TP.8); regression test pin đúng số production (`copy-zones.test.ts`). Follow-up candidate (chưa làm): imagePrompt nêu đích danh aspect + safe-area ≥10% (giảm lệch ratio từ gốc), verify hậu-place. |

## Ghi nhận teardown DA (2026-11-06, owner yêu cầu té code sau khi ship — 20 phát hiện, trả nợ trong ngày)

**P0 — vi phạm luật tự đặt:** (1) outline card nói dối chi phí — label chỉ ghi "N pages ≈ N images" trong khi phase 2 chạy auto refine (đốt tới 2N ảnh + N reads); sửa: card + nút Generate dùng ĐÚNG MỘT nguồn `costHintText` (kèm worst case refine). (2) Record multi-page nói sai 2 cách — verdict trang cuối gắn canvas trang 0, verdict các trang khác biến mất khỏi conversation; sửa: hero verdict = trang 0 (ghép đúng canvas hero) + field additive `selfImprovePages[]` trên event terminal (D14, persist tự động) + renderer badge chỉ nhận verdict từ canvas event (ghép cặp với canvas đang hiển thị). (3) Critic clean-plate hỏi sai câu với trang 2+ (đối chiếu blocks chỉ đặt lên trang 0); sửa: `overlayCopy` per-page — trang 0 = blocks, trang sau = "purely visual plate" (test pin từng prompt).

**P1:** (4) Budget flat 480s vs default-ON refine = abort giữa deck 6+ trang; chốt: `chatBudgetMs = 480s + pages × rounds × 150s` từ số liệu thật 221s/2-round (test ghim cả ceiling 9 trang + approvedOutline quyết định pages). (5) Bookkeeping rounds không nhất quán giữa 3 nhánh lỗi; sửa: `roundsRun` = số re-generation SINH RA ẢNH — một biến, mọi nhánh dùng nó. (6) `void err` nuốt errorClass của refine-regen failure; sửa: note ghi lớp lỗi (`regeneration failed (quota_exceeded)`); lượt planner refine đốt quota được ANNOUNCE trong note. (7) Tổ hợp mặc định (research+refine cùng lúc) chưa từng nghiệm cùng nhau; sửa: test agent mới + DA_RESEARCH real job chạy BOTH — xanh trên cặp thật (pass/r0 trung thực). (8) Test cancel mô phỏng abort "hiền" (generate vẫn return ảnh); sửa: stub throw đúng failure mode — ảnh TRƯỚC vẫn yield.

**P2:** (9) Mock critic counter theo instance-lifetime → gate phụ thuộc thứ tự chạy; sửa: counter theo jobId (Map bounded 100). (10) Node "Checking" treo running khi abort giữa lúc critic đọc; sửa: flip trước mọi lối thoát. (11) Critic poster nhận đoạn văn TRÙNG 2 LẦN (prompt + intendedCopy); sửa: copy nằm MỘT nơi, criterion tham chiếu (test đếm đúng 1 lần xuất hiện). (12) Trường `text` overload ngữ nghĩa theo mode; sửa: đổi tên `textHandling` (wire chưa release nên đổi miễn phí, mock + test theo). (13) Vòng refine ~120 dòng inline trong generator; sửa: tách generator `refinePage` (taskMeta trả về qua return value, caller adopt). (14) `selfImproveRounds` gọi 2 lần trong một expression; (15) 2 cast không SAFETY comment; (16) dead guard `k===1` trong label; (17) realSmoke: regex "sourced" giờ yêu cầu domain/URL trong ngoặc (không chấp nhận "(mock planner)"), DA_REFINE kiểm assetBytes trên disk, DA_RESEARCH thêm assert verdict; (18) description researchNotes mâu thuẫn required — sửa wording ("null when research was not enabled or found nothing").

**Meta:** (#19) Bug flag `--search` (top-level, phải TRƯỚC subcommand `exec`) vốn bắt được MIỄN PHÍ bằng unit test assert argv — đã thêm pin test (codex.test.ts: thứ tự argv, --search đứng đầu, image role không bao giờ có flag). (#20) Gate tự viết ngoài mục đích thì xanh, đúng mục đích thì mỏng — đã thêm đúng test từng lỗ hổng (multi-page persistence, combined default, cancel-throw). Bài học lặp lần N: gate phải assert đúng cái nó claim, không phải sự hiện diện của chuỗi.

**Gates sau teardown:** build/test/typecheck toàn repo xanh (agent 72, services 40, schema 22, providers 40); smoke + shot xanh (outline card giờ hiện đủ cost law); desktop-audit OK; REAL_SMOKE rerun ALL_OK 270s (combined job + assetBytes check mới).
