# Stage-0 seller sessions — moderation kit

* **Owner:** cuongducle
* **Date prepared:** 2026-10-30
* **Status:** ready — sessions not yet run
* **Design of record:** [`banner-maker-loop-stage-0.md`](../designs/banner-maker-loop-stage-0.md) (Overview → "How Stage 0 is validated", CUJs 1–5 & 7, reference-fidelity criterion)
* **What these sessions decide:** exit criteria met → roadmap step 2 (persistence hardening design input); not met → the blocker list becomes the next design's input.

**The one rule that makes the data valid:** each seller drives the loop herself —
**describe → generate → edit copy → attach the real product photo → export** —
with narration only. The owner's hands never touch the keyboard while a task is in
progress. Every keyboard touch by the owner is logged as an *intervention* and counts
against criterion S1.

---

## 1. Scope — what this validates and what it deliberately does not

**In scope (the loop):** CUJ 1 (first banner, no API key), CUJ 2 (edit without
regeneration), CUJ 7 (real product through the model), CUJ 5 (big artwork survives to
the editor + export), the stop control, quota visibility, the Vietnamese error/action
messages, marketplace presets.

**Recorded gaps — NOT tested here, do not "fix" them mid-session** (desktop-era
questions, per the design):

1. Seller onboarding (installing Node, the Codex CLI, `codex login`) — the owner
   sets the machine up beforehand.
2. Whether the target sellers' own ChatGPT plans include Codex image quota — the
   sessions run on the **owner's** login and quota.
3. The worker/Redis path — sessions run **without `REDIS_URL`**, chat path only.

## 2. T-1 day checklist (owner)

Run every item; a failed item postpones the session (a doomed session wastes a seller
and quota).

| # | Item | Command / where | Expected |
| --- | --- | --- | --- |
| 1 | Codex CLI present | `codex --version` | `codex-cli 0.163.0` or newer |
| 2 | Logged in | `codex login status` | `Logged in using ChatGPT` |
| 3 | App builds | `pnpm build` (repo root) | all 9 tasks succeed |
| 4 | App runs keyless pair | `IMAGE_PROVIDER=codex LLM_PROVIDER=codex pnpm --filter @oia/web start` | ready on :3100, no mixed-config error |
| 5 | No Redis in env | `echo $REDIS_URL` | empty (chat path only) |
| 6 | Status endpoint | `curl -s localhost:3100/api/provider/status` | `code:0`, image/llm name `codex`, `loggedIn` true, quota counters present |
| 7 | One real warm-up generation | Home → prompt "banner trà sữa giảm 20% ngày 8/11" | artwork + editable price/date blocks; ~30–60 s; quota chip +1 ảnh |
| 8 | Reference warm-up (packaged product) | attach a packaged-product photo → generate | product recognizable, label lettering preserved |
| 9 | Data dir noted | `ls .data` | fresh or backed up — session notes must record which |
| 10 | Recording setup | screen + audio, seller-permission form ready | tested once |
| 11 | Quota budget armed | — | see §2.1; backup channel verified |
| 12 | Printed task cards + observation sheets | §5 and §6 | one set per seller |

### 2.1 Quota budget per session

Codex docs: image turns burn included limits **~3–5× faster** than comparable turns.
Plan per session: **~12–18 image turns** (first banner + retries + product run +
one export-size redo), plus planner turns (cheap, seconds each). Record
`/api/provider/status` counters **before and after** each session on the sheet.

**Backup plan (pre-committed, no mid-session deciding):** if the owner's account
hits `quota_exceeded` mid-session → tell the seller the verbatim line
("Hết lượt AI trong hạn mức này — mình đổi sang kênh dự phòng nhé"), then switch:
stop app → `IMAGE_PROVIDER=openai LLM_PROVIDER=openai OPENAI_API_KEY=… pnpm --filter @oia/web start`
→ resume. Mark the session "finished on backup channel" on the sheet (the loop is
provider-symmetric; the quota story differs and is noted, not hidden).

### 2.2 Consent (verbatim, before the session starts — record Y/N)

> "Ảnh sản phẩm cô/chú gửi lên sẽ đi qua tài khoản OpenAI/ChatGPT của bên tổ chức để
> AI dựng cảnh theo đúng sản phẩm. Ảnh chỉ dùng cho buổi hôm nay và bị xóa sau buổi.
> Buổi được quay màn hình và âm thanh để cải thiện sản phẩm. Cô/chú đồng ý không?"

A "no" on any clause = no recording and/or no photo upload; the session continues
with the remaining phases and the gap is noted.

## 3. Session flow (60–75 min)

5 sellers max, one at a time, on the owner's machine, one browser profile per seller.
The owner sits beside, narrates, and NEVER drives. Screenshot the canvas after every
phase (timestamped).

### P0 — Warm-up (5 min, no app)
Ask, record quotes verbatim: "Hôm nay cô/chú thường làm banner kiểu gì? Dùng gì để
làm? Khi sai một chi tiết (số tiền, ngày) thì sửa thế nào?" — this is the problem
statement being confirmed, not small talk.

### P1 — First banner (CUJ 1) — 10–15 min
Hand the seller task card P1 (§5). Observe silently: does she type one Vietnamese
sentence? Does the plan land as editable blocks (price/date visible as textboxes)?
Does she notice the "Chữ sửa được ngay" toggle — ask afterwards what she thinks it
means. **Interventions log:** every time the owner must touch the keyboard/mouse.

### P2 — Edit without regenerating (CUJ 2) — 10 min
Task card P2: change the discount and the date to values the seller chooses.
The pass condition is that the textbox edit applies and **no generation job starts**
(no quota chip movement, no stream). Note if she reaches for re-generation instead —
that is a finding even if she eventually succeeds.

### P3 — Real product through the model (CUJ 7) — 10–15 min
Task card P3 with her own product photo. **At least 3 of the 5 sessions must use a
packaged product** (printed label text visible) — the reference-fidelity criterion is
measured on packaged runs. At export size, judge and record: product recognizable
(Y/N), label lettering legible (Y/N). Do not prompt her toward manual layering; the
reference-first path is the designed behavior.

### P4 — Export what she would post (CUJ 5) — 10 min
Task card P4: export at the marketplace frame she actually sells on. The file must
open, be the right size, and — asked in her words — "đây là file cô/chú sẽ thật sự
đăng lên gian hàng chứ?" Record Y/N exactly as said.

### P5 — Stop drill (optional, 5 min, owner-suggested)
Mid-generation, ask her to press **Dừng**. Watch: stream ends, terminal cancelled
state, no continued quota burn on the chip. Low-stakes; skip if the session runs long.

### Debrief (5 min)
"What was confusing? If you had this app on your computer tomorrow, would you use it
for your next banner — why / why not?" Record verbatim.

## 4. Scoring & exit criteria (evaluate only after ALL sessions)

| # | Criterion (design, verbatim meaning) | Measure |
| --- | --- | --- |
| S1 | Every seller completes the loop **without developer intervention** | zero owner-keyboard events during P1–P4 per seller |
| S2 | Each session produces ≥1 real **edit-without-regeneration** | P2 pass per seller |
| S3 | Each seller exports a file **she says she would post** | P4 verbal Y per seller |
| R1 | Reference fidelity (pre-committed): product recognizable AND label legible at export size in **≥ 2/3 of packaged-product reference runs across sessions** | P3 packaged runs only |

**Decision rules (pre-committed — no new decisions mid-process):**

* S1–S3 all met → Stage 0 exits; findings feed the roadmap step-2 design.
* Any of S1–S3 unmet → the blockers become the next design's input; do not patch code
  mid-session to make a criterion pass.
* R1 below 2/3 → the fallback engages **without a new decision**: the reference
  prompt gains a "minimize brand text on packaging" variant AND the manual-layering
  path is surfaced first for packaged products. G8's default flips only by owner
  decision (explicit, dated, recorded here).

## 5. Seller task cards (verbatim Vietnamese — print one set per seller)

> **Thẻ P1** — "Cô/chú hãy tự làm một banner khuyến mãi cho một sản phẩm mình đang
> bán. Gõ yêu cầu bằng một câu, giống như khi nhắn cho ChatGPT, rồi bấm nút tạo."

> **Thẻ P2** — "Banner đã ổn rồi. Giờ cô/chú muốn đổi mức giảm và đổi ngày khuyến mãi.
> Hãy tự sửa cho đúng ý mình — hôm nay có một quy tắc: **không tạo lại ảnh**."

> **Thẻ P3** — "Đính kèm ảnh sản phẩm thật của cô/chú, rồi yêu cầu làm một banner bán
> đúng sản phẩm này (nền cảnh đẹp, sản phẩm thật nổi bật)."

> **Thẻ P4** — "Xuất file ảnh đúng khung [Shopee / Lazada / TikTok Shop] mà cô/chú sẽ
> thật sự đăng lên gian hàng của mình."

> **Thẻ P5 (nếu có)** — "Đang tạo ảnh mà cô/chú đổi ý — hãy dừng nó lại."

## 6. Observation sheet (one per seller — copy this block)

```yaml
seller:            # mã, không ghi tên thật nếu seller không muốn
session_date:
app_build:         # git rev
channel:           # codex (login) | backup-openai (nếu đổi giữa chừng)
recording_consent: # Y/N; photo_consent: Y/N
quota_before:      # {image: n, planner: n}  từ /api/provider/status
quota_after:
interventions:     # list — {phase, why, hands_on_keyboard: bool}
p1_first_banner:   # pass/fail + notes (one sentence? blocks editable? toggle understood?)
p2_edit_no_regen:  # pass/fail + "did she try regenerating first?" + what she edited
p3_reference:
  product:         # gì
  packaged:        # Y/N  (nhãn in có chữ)
  product_recognizable:   # Y/N at export size
  label_legible:          # Y/N at export size
p4_export:
  frame:           # Shopee / Lazada / TikTok Shop / khác
  would_post:      # Y/N — nguyên văn câu trả lời
p5_stop:           # ran? stream ended? chip stopped?
debrief_quotes:    # nguyên văn
friction_notes:    # map vào: planner | blocks/zones | reference | export | UI copy | khác
```

## 7. After the sessions

1. Transcribe sheets into a findings table (EGM style: `id | description | evidence
   (quote / timestamp / screenshot) | severity | design area`).
2. Score S1–S3 + R1 exactly per §4; record the decision and date here.
3. Update the design appendix (banner-maker-loop-stage-0.md) with: sessions run
   (dates, n), criteria outcomes, blockers/finding ids, and the chosen next step.
4. Delete uploaded product photos per the consent promise; keep recordings only as
   long as agreed.
