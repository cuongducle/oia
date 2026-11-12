---
type: "Design"
title: "Desktop-only reorg plan"
description: "Single source of truth for current scope: decisions D1-D14, the seven-step checklist with gates, and the known-debt ledger; the web app was deleted in step 6."
tags: [design, plan, scope]
status: stable
generated: { by: human:cuongducle, at: 2026-10-30T00:00:00Z }
---

# Kế hoạch chốt: desktop-only, bỏ web

**Ngày chốt:** 2026-10-30 (sau phiên review toàn diện + tham chiếu `stablyai/orca`)
**Sửa lần 2:** 2026-10-30 · hấp thụ review ngoài (11 điểm: 3 Critical, 4 High, 4 Medium/Low); owner chốt UI tiếng Anh.
**Trạng thái:** quyết định của chủ sở hữu, đây là bản ghi thực thi.

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | Desktop (Electron) là sản phẩm DUY NHẤT. Web app sunset sau khi port xong. |
| D2 | Bỏ hết cái thừa: `apps/web`, `packages/db` (code chết), Redis CI, BullMQ. **GIỮ `packages/skills`**: xem D9. (`apps/worker`, `docker/` đã xóa ở bước 3.) |
| D3 | Tổ chức cho macOS + Windows. Gate: build macOS pass KHÔNG phải bằng chứng cho Windows, phải kiểm trên máy Windows thật. |
| D4 | Brand Kit: port panel tối giản sang desktop (dữ liệu đã có trong `tasks/brandkits.ts`, planner đã đọc qua `services/context.ts`). |
| D5 | Toolbox: GIỮ TOÀN BỘ 13 tool + Background Remover. PPT Translator hiện là landing, xếp implement hậu kỳ, không chặn v1. |
| D6 | Không tạo `packages/studio` / `packages/desktop-contract`, chỉ còn 1 consumer (YAGNI), UI ở `apps/desktop`, hợp đồng IPC ở `src/shared`. |
| D7 | Mượn từ Orca 3 thứ: baseline ratchet (nợ đo bằng số, chỉ được giảm), process-host pattern cho CliRuntime Windows, knip dò code chết. Không copy `cloud/`, `mobile/`, `Casks/`. |
| D8 | **CHỐT CUỐI (owner, 2026-10-30): desktop UI ship bằng TIẾNG ANH.** Tiếng Việt chỉ ở mức nội dung banner (font Be Vietnam Pro). Ghi đè G7 của Stage 0 ("plain-Vietnamese messages") ở khối UI; provider-errors map class→key, bản EN trong `renderer/lib/errors.ts`. `i18n.ts` đã copy sẽ TRIM về en-only (chỉ dùng làm nguồn I18nKey), làm ở bước 4. Lý do ghi nhận: owner quyết định sản phẩm; mâu thuẫn với persona seller Việt đã cân nhắc và chấp nhận. |
| D9 | GIỮ `packages/skills` + loopback agent API trong desktop main, bind 127.0.0.1, tái dùng ServiceContext (taskStore, apiKeyStore, fileStore). **Spec bảo mật/vận hành đầy đủ** (xem mục "Loopback API spec" riêng). |
| D10 | **Quan hệ với Stage 0 (hấp thụ review điểm 1):** engine của banner loop ĐÃ shipped + test (TP.2 CodexLlmProvider `llm/codex.ts`; TP.3 clean-plate trong schema/designer; blocks[] qua `copy-zones.ts`; TP.9 reference `-i` qua bridge; TP.4/5/7/8 ở providers/tasks/canvas). Vì vậy plan này không lặp lại chúng. Rationale "chứng minh loop trên web trước khi đóng gói" của Stage 0 **BỊ GHI ĐÈ** bởi quyết định desktop-only của owner (desktop đã có code, web transitional). Hai di sản Stage 0 vẫn sống: (a) **buổi validation với seller thật chưa chạy**: chuyển thành gate ở bước 7 trước khi phát hành rộng; (b) roadmap step 2 (persistence hardening) được kéo vào thành điều kiện tiên quyết v1, xem bước 5. Doc `banner-maker-loop-stage-0.md` đánh dấu superseded-in-parts (đã gắn banner ở đầu file). |
| D11 | **Utility process ngay ở bước 4 (review điểm 4, phương án B):** services (taskStore, runChat, loopback server, spawn CLI) chuyển vào 1 `utilityProcess`; main chỉ giữ window/menu/IPC/dialog/updater. Lý do: loopback API + tools đang được thiết kế contract mới, chuyển sau sẽ đắt hơn; crash cô lập; main block = treo cả app. |
| D12 | **GHI ĐÈ T3 (owner, 2026-11-06): codex ĐÓNG KÈM app, pin theo cặp phiên bản.** Sau khi đối chiếu 5 dự án OSS làm agent (openai/codex SDK TS+Python, block/goose, sst/opencode, cline/cline): 4/5 đóng binary vào app hoặc cài kèm theo nền tảng; riêng OpenAI SDK pin "exact compatible binary", binary + client là một cặp được test cùng nhau. T3 (không pin, chạy `releases/latest`) chỉ còn đúng cho nút Install trong Runtime Panel (dev/unpackaged, không có binary đóng kèm). Cơ chế: `resources/codex-pin.json` pin tag → `pnpm --filter @oia/desktop fetch-codex` tải release checksummed vào `apps/desktop/resources/codex/` (gitignored, build artifact) → bước 7 electron-builder extraResources chép vào `Contents/Resources/codex` (Windows: `resources/codex`). Thứ tự detect mới: CODEX_BIN env → **bundled** → PATH+well-known → managed. Lợi: mở từ Dock/Finder chạy ngay không cần setup (GUI app không thấy shell PATH), hết họ lỗi "release codex mới gãy đồng loạt". Chi phí: ~166 MB archive / ~407 MB giải nén mỗi nền tảng + cập nhật codex phải qua build app (đổi lại được test cặp). **Pin rust-v0.166.0 đã nghiệm đúng nghi thức trên: DESKTOP_REAL_SMOKE OK (2026-10-30, version=0.166.0, assetBytes=1942938, 40 giây, không lỗi), một generation thật chạy qua binary đóng kèm. Luật từ nay: bump pin ⇒ REAL_SMOKE phải pass qua binary mới trước khi ghi "tested pair" (chạm quota, owner duyệt).** Còn treo cho sau này (KHÔNG chặn v1): codex có `app-server` (daemon WebSocket + schema TypeScript cho client nhúng), bề mặt được thiết kế chính cho app như Oia, thay thế spawn CLI `--json` (bề mặt không cam kết, rủi ro T3 còn lại) khi chi phí chuyển đổi đáng. Nguồn: zread.ai/openai/codex (18-python-sdk, 19-typescript-sdk), zread.ai/block/goose (25-desktop-ui-architecture), zread.ai/sst/opencode (18-desktop-application), zread.ai/cline/cline (26-desktop-app-architecture). |
| D13 | **(owner, 2026-11-06): cài mới mặc định `auto` + consent ĐÃ ĐỒNG Ý**: zero-config cho chế độ thật: máy nào đang có codex CLI + ChatGPT login sẵn sẽ chạy codex ngay lần mở đầu tiên, không cần click nào. Ghi đè mặc định consent=false của TP-D3 (resolver không đổi, vẫn cần runtime `ready`); rủi ro được owner chấp nhận và ghi nhận: một máy lạ có codex đã login sẽ đốt quota ngay từ launch đầu. Vẫn được bảo vệ bất kể consent: không có binary / chưa login → mock; CI smoke/shot ghim mock bằng env; `codexConsent: false` tường minh vẫn được tôn trọng (opt-out ở lại là opt-out). Default sống ở hàm thuần `normalizeProvidersSettings` (shared/providers-mode.ts) + test ghim ở desktop.test.ts. |
| D14 | **(2026-11-06, từ self-review bước 5): thêm field tùy chọn vào schema KHÔNG bump `OIA_SCHEMA_VERSION`**: additive optional (vd `sample?: boolean` trên project) là tương thích hai chiều: build cũ parse file mới được (strip field), build mới parse file cũ được (undefined). Bump CHỈ khi cần một bước migration phải chạy (thêm `from/to` vào PROJECT_MIGRATIONS) hoặc có breaking change. Lý do ghi nhận: tránh số version chạy trốn Detected meanings; quyết định trước đây sống sót trong comment code, vi phạm luật "decision sống trong doc", nay chuyển về đây. |
| D15 | **(owner, 2026-11-01): BỎ tool OCR (ai-image-editor) + tesseract.js khỏi sản phẩm.** Sau khi B1 deconstruct chuyển sang vision model (bỏ tesseract theo chốt 2026-10-31), tool OCR rời không còn người dùng. Xóa toàn bộ chuỗi theo nó: dependency tesseract.js, allowance CSP `https://cdn.jsdelivr.net` (origin mạng DUY NHẤT của renderer, giờ renderer fully offline, zero network origin), `blob:` trong `worker-src` (chỉ tesseract spawn blob worker; pdf.js load worker từ asset 'self'), job CI `ocr-nightly`, fixture + kịch bản shot `OIA_SHOT_OCR`. `'wasm-unsafe-eval'` GIỮ với lý do mới: pdfjs-dist 6 mang wasm decoder thật (openjpeg.wasm, jbig2.wasm) cho PDF JPX/JBIG2. Registry còn 13 tool; ppt-translator vẫn là landing duy nhất. Ghi đè câu "tool OCR sẵn có ở Tools GIỮ NGUYÊN" trong deconstruct-import.md. Bài học giữ lại: bug `res.data.words` (tool chết âm thầm từ thời web) là bằng chứng vì sao gate này từng tồn tại, lưỡi liềm gate chạy tay-một-lần vẫn đúng. |
| D16 | **(owner, 2026-11-02): mặc định banner là CHỮ CHẴN TRONG ẢNH (mode `poster`); deconstruct thành CẦU CHỈNH SỬA ngay trong editor.** Owner so với đối thủ tham chiếu (surgepix.ai, GPT-Image-2 render chữ vào ảnh, typography đẹp): chữ layer mặc định của Oia (Be Vietnam Pro bold trắng, không styling) trông xấu cạnh họ; "xấu là không ổn". Cả hai nửa đã có sẵn trong schema từ TP.3 (`poster` bakes text vs `clean-plate` cấm chữ), quyết định chỉ ĐỔI MẶC ĐỊNH: Home composer `editableText` mặc định false (toggle "Editable text right away" trong More giữ nguyên cho ai muốn layer ngay); lối sửa chữ cho kết quả baked: nút **"Make text editable"** trên ContextToolbar của layer ảnh trong Editor (D16 mới), export page PNG → task `deconstruct` (≈ 1 image + 1 read, dialog xác nhận chi phí + Stop, poll giữ kết quả đã trả nếu cancel muộn, cùng teardown B1) → `replaceCurrentScene(deconstructScene(...))` (undo/history/save đi đường thường). Trade-off được ghi nhận: sửa chữ trên banner baked tốn quota (1 image + 1 read) so với sửa text layer miễn phí, giá của typography đẹp theo mặc định; thesis "text is a native object" không chết: nó là lối thoát (escape hatch) chứ không còn là mặt định. Shot gate pin `mode` tường minh (index.ts:498) nên không vỡ. |
| D17 | **(owner, 2026-11-04): cảnh báo SỚM khi tài khoản ChatGPT không có quyền tạo ảnh.** Bằng chứng thật (máy Windows, codex 0.166.0): tài khoản plan `free` đăng nhập OK, `codex exec` với `$imagegen` **exit 0** nhưng chỉ trả lời "the built-in image generation tool isn't available", không PNG, vẫn tốn token planner. Trước đây lỗi này rơi vào `no_output` (gợi ý Retry, sai, retry chỉ đốt thêm quota). Quyết định: (a) `RuntimeProvisioner.status()` đọc claim `chatgpt_plan_type` trong id_token của `$CODEX_HOME/auth.json` (offline, chỉ decode payload, không verify/log/gửi token) → `planType` + `imageGen: available|unavailable|unknown`; CHỈ plan đã kiểm là thiếu tool (`free`) mới thành `unavailable`, plan lạ/file hỏng = `unknown`, không cảnh báo (cảnh báo sai đẩy seller trả tiền rời đi); (b) Runtime panel: badge warn + notice "needs ChatGPT Go or higher", không hiện "Use real Codex", nút Sign out đổi nhãn "Sign out to switch account"; sidebar: "no image generation on this plan"; (c) lưới an toàn phản ứng: stdout có câu tool-unavailable → `capability_unsupported` (wire name có sẵn, không đổi contract) thay vì `no_output`. KHÔNG chặn generation (text tools vẫn chạy; chặn cứng chờ owner quyết). Lưu ý: claim trong token có thể cũ nếu nâng plan sau khi login, notice hướng dẫn sign out/in lại. Gate: `packages/providers/test/codex-account.test.ts` (fixture stdout thật `stdout-imagegen-unavailable.jsonl`), desktop.test.ts + ui-v11-shell.test.ts. |
| D18 | **ĐÃ RÚT (owner, 2026-11-07): BYOK qua `codex login --with-api-key`, ship 1 commit rồi revert theo lệnh owner, không ghi lý do kèm theo.** Diễn biến: sau D17 (plan Free không sinh ảnh) đã làm lối đăng nhập bằng API key, key qua stdin (không bao giờ vào argv/`ps`), share in-flight guard với `login()`, IPC `runtime:loginApiKey` + schema `sk-…`, khi `loginMethod==="api-key"` ghim model API `gpt-5.5`, thread model về construction-time trong registry (vá gap T3). Commit `f4a90db` (rebase lên main, CI xanh cả ba job smoke). Owner chốt bỏ ngay sau đó, revert toàn bộ code + test + UI; gate thật D12 (login key thật + 1 generation thật) chưa từng chạy nên không user nào từng thấy tính năng quảng cáo. Lối thoát cho plan Free hiện tại = D17 (cảnh báo + sign out đổi tài khoản). Cơ chế nền tẫn GIỮ NGUYÊN trên main (có từ trước D18, không phải code chết): `loginMethod` trên `RuntimeStatus`, nhãn UI "API key", `probeLogin` nhận diện login API key, cờ `--with-api-key` của binary pin, nếu mở lại, tham chiếu commit `f4a90db` trong git history. |
| D19 | **(owner, 2026-11-09): landing + README định vị rõ persona seller marketplace, bề mặt giữ tiếng Anh theo D8.** Sau audit bên ngoài (hero không nói sản phẩm là gì, bẫi download, tràn mobile, README lẫn ghi chú nội bộ), owner duyệt "sửa lại hết" theo hướng: copy tiếng Anh nhưng headline/sub phải chứa từ khoá ngành (banner · promo · Shopee/Lazada/TikTok Shop · seller), phục vụ cả seller Việt (persona chính; mâu thuẫn với D8 đã được cân nhắc và chấp nhận từ D8) lặp seller quốc tế; KHÔNG mở lại D8. Kèm theo: landing rebuild tĩnh hoá hoàn toàn (xem ghi nhận 2026-11-09), README gọn ~190 dòng với Download lên đầu, nội dung ops deploy chuyển `docs/private/` (gitignored), `wrangler.toml` bỏ account_id/tên người. Nợ ghi nhận (chưa làm): asset release đặt tên KHÔNG chứa version để pin `releases/latest/download` cố định (hiện resolver hỏi GitHub API + fallback const); đồng bộ brand app sáng ↔ site tối (wordmark, theme); trang SEO tiếng Việt riêng cho từ khoá tìm kiếm VN; demo GIF 15s cho README. |
| D20 | **(owner, 2026-11-09): TUYỆT ĐỐI không dùng em dash (U+2014) và en dash (U+2013) trong MỌI văn bản của repo: UI copy, comment code, docs, prompt gửi model, fixture, README/site.** Lý do: owner ghét ký tự gạch ngang dài là dấu hiệu văn bản do LLM sinh; thay bằng dấu phẩy, hai chấm, ngoặc, hoặc tách câu. Phạm vi áp dụng cả prompt template gửi planner/vision (chữ vẫn rõ nghĩa, chỉ đổi dấu câu). Ngoại lệ có chủ đích (glyph chức năng, không phải văn phạm): icon hình dòng (giá trị glyph `line` trong shape picker, Editor.tsx, đứng cạnh ◇ ┄ →). Quy tắc tương tự đã vào `~/.pi/agent/AGENTS.md` cho mọi phiên agent sau. |

## D22: khôi phục kiểu chữ khi Make text editable

### Tách mô-đun theo trách nhiệm (2026-11-12, owner duyệt)

Chỉ tổ chức lại mã, không đổi thuật toán, prompt, ngưỡng, giới hạn 15 giây,
chi phí hay hợp đồng tác vụ. Bản đồ và luồng:
[deconstruct-flow.md](../reference/deconstruct-flow.md).

- Phần tác vụ chuyển vào `packages/tasks/src/deconstruct/`: điều phối,
  đọc chữ, bảng ảnh cắt, màu mực, khung mực, vùng xóa, nền và sót chữ.
  `processors.ts` vẫn xuất tên cũ. Hai tệp plate/sheets cũ chỉ chuyển tiếp
  để các kịch bản đã ghi trước đây không gãy; không giữ bản sao thuật toán.
- Phần giao diện tách `font-reference-board.ts` (chuẩn bị) và
  `font-ranking.ts` (chấm phông); `font-reference.ts` giữ tên xuất cũ.
- Chỉ kịch bản shot deconstruct chuyển khỏi main sang
  `main/shots/deconstruct.ts`. Không tái cấu trúc toàn bộ Electron shell.
- Hàm tải dữ liệu ảnh chung chuyển nguyên sang `asset-bytes.ts`, không
  viết một bản khác riêng cho deconstruct. Bỏ hàm chết `ctxNameUnused`.

Bằng chứng trước/sau trong
`docs/private/real-runs/2026-11-12-deconstruct-refactor/`: so với `906cf20`,
36 thân hàm được chuyển không đổi (chỉ chuẩn hóa tên hai hàm canvas nội bộ
khi đối chiếu). Trên ảnh owner, texts-final.json, erase-regions.json và PNG
đầu ra giống hệt từng byte; đã mở ảnh sau. Cả hai lượt đều chạm giới hạn
so phông và trả bản ban đầu, nên đây không phải chứng cứ nhánh xếp hạng
hoàn tất trên ảnh dày. Nhánh chấm phông được chạy qua text-smoke với nguồn
Canvas2D độc lập. 0 lượt trả phí mới, không chạy provider/detector mới.

Gates cục bộ: build/test/typecheck, text-smoke, smoke, crash-smoke, shot xanh.
Các giới hạn chất lượng D22 vẫn giữ nguyên, refactor không đồng nghĩa ảnh
tốt hơn.

### Tối ưu vị trí/cỡ chữ/khung chữ theo chỉ định owner (2026-11-12)

Owner chốt giữ kiến trúc hiện tại, chỉ tối ưu vị trí, cỡ chữ, khung chữ.
Không triển khai VecFont/LaMa. Giãn tối đa 2x là lựa chọn triển khai của
agent, KHÔNG phải con số do owner chỉ định.

**Đính chính sau owner báo sai:** kết luận ở commit `f62876f` không hợp lệ.
Các hàng từng gọi là "decor" có dấu tiếng Việt thật. Hộp VẮNG 83px/HÀNG
74px đã cắt dấu, không phải đo khít hơn. Không được giải thích chỉ số giảm
chỉ bằng "đánh đổi phông chữ" khi chưa mở ảnh và đối chiếu dấu.

Sửa sau kiểm tra:

- Refine dùng hệ tọa độ của chính inkBox (gồm cả x/y và góc), thay vì lấy
  kích thước kernel rồi kẹp vào gốc của hộp padded. Tìm mực quanh kernel
  cho cả đầu/cuối nét và dấu rời; bỏ sàn mật độ 15% ngoài kernel. Hàng dấu
  2 pixel không bị loại chỉ vì tiêu đề dài. Lối không có inkBox giữ nguyên.
- Khoảng cách ký tự ban đầu theo spacingEm đã đọc, không tự phân phối phần
  chiều ngang còn dư thành tracking tới 0,15 em. Co giãn khung vẫn có giới
  hạn 2x và dùng chung trong xếp hạng phông lẫn vẽ.
- Shot trước đây dùng ảnh chỉ có SALE 50 nhưng mock khai 3 dòng. Mốc giá
  [181,124.5] là nét SALE không liên quan, không phải chứng cứ giá đúng chỗ.
  Nay nguồn Canvas2D độc lập vẽ đúng 3 dòng (có giá xoay và dấu tiếng Việt),
  gate so với tọa độ nguồn thật, giữ sai số 3px. Không nới ngưỡng để ép xanh.
- Kiểm thử chống tái phát: kernel dịch vị trí, biểu tượng cùng màu bên cạnh,
  dấu trên/dưới ngoài kernel, hàng dấu chỉ 2 pixel trên dòng dài, tracking
  không tự sinh, ảnh chữ co giãn đối chiếu nguồn Canvas2D sau lưu/nạp JSON.

Bằng chứng: `real-runs/2026-11-12-textdet-e2e/run-08-layout-harness/`;
harness lặp lại `apps/desktop/scripts/deconstruct-layout-replay.mjs`, từ
texts-final.json có inkBox đã ghi, giữ nguyên paid plate, ghim SHA và từ
chối ghi đè. 0 lượt trả phí mới; KHÔNG phải chạy lại provider/detector hay
Editor trên ảnh owner. Đã mở ảnh so sánh và ảnh tái tạo kích thước gốc.

So trên CÙNG vùng cố định của run-04-colorfix, không đổi crop theo bản sửa:

| Bản | SSIM | IoU mực |
|---|---|---|
| Trước tối ưu (colorfix) | 0,397 | 0,237 |
| Bản lỗi đã ship (fill4) | 0,360 | 0,217 |
| Sửa tọa độ và dấu (run-08) | 0,418 | 0,321 |

Nền ngoài mặt nạ lệch >30 giữ khoảng 0,257%. Phông vẫn xấp xỉ; plate đã
trả tiền từ run-04 vẫn có vài vệt mờ quanh dấu VẮNG. Không sửa nền trong
vòng này, không tuyên bố ảnh đã giống gốc/được owner duyệt.

Gates: build/test/typecheck, text-smoke, smoke, shot xanh. Shot bắt lỗi
fixture trước khi được sửa đúng nguồn; không hạ ngưỡng. CI và máy Windows
thật là hai loại bằng chứng khác nhau, máy Windows thật chưa chạy.

### Metric chất lượng gốc-vs-tái-tạo (2026-11-12, owner hỏi "đạt chưa, đo bằng gì")

Trước đó: so sánh gốc-vs-tái-tạo chỉ bằng MẮT (comparison PNG) + gate hình
hình học/màu theo dòng; D23 từng đo SSIM tay trên banner đơn giản (0,849).
Nay có harness lặp lại được `apps/desktop/scripts/deconstruct-metrics.py`:
SSIM + PSNR theo vùng chữ (đúng quy ước paper scene text editing: CVPR26
Training-free STE 89,30 SSIM / 22,47 PSNR; AAAI23 stroke-level cùng bộ;
nghi chú 2026: SSIM/PSNR nhạy dịch chuyển + khử răng cưa), ink IoU nội bộ,
bảo toàn nền ngoài mặt nạ chữ (chỉ số này đã bắt được giả định: bug vá ô
màu cũ đổi 17% pixel, nền lành chỉ 0,26-0,43% pixel lệch >30).

Số trên ảnh owner: detector lane 0,397 SSIM / 0,237 IoU; lane LLM replay-10
(render không trần) 0,574 / 0,441; texts replay-10 + harness trần 15 giây
0,544 / 0,390 (trần tốn ~0,03 SSIM). Phát hiện kèm: fonts.css + trần 15s là
no-op (fallback phông mồi trước khi ranking kịp dùng phông thêm). Khoảng
0,4-0,6 là đặc trưng phông xấp xỉ + nền provider vẽ lại trong vùng chữ trên
poster dày; paper 0,7-0,9 là method train theo style từng cảnh. Chi tiết +
bảng: real-runs/2026-11-12-textdet-e2e/README.md.

Đề xuất chờ owner duyệt: metrics vào real-run làm số liệu BÁO CÁO; gate tự
động = bảo toàn nền + gate hình học/màu hiện có; KHÔNG gate SSIM vùng chữ
trong khi phông còn xấp xỉ. SSIM/IoU dùng đo tiến bộ (bundled condensed
font, ranking tốt hơn).

### Sửa màu chữ lane detector (2026-11-12, owner báo "màu chữ đang sai")

Run-04 mọi dòng ĐỎ/TRẮNG đều về seed #000000 (đo màu thất bại, rơi dự phòng).
Ba nguyên nhân chồng nhau, lần lượt cô lập bằng dữ liệu thật:

1. Unclip làm hộp detector nới rộng; refine theo màu seed đen không siết được
   hộp chữ đỏ/trắng; hộp to làm vành đo nền xuyên mép badge/band.
2. Một màu mực bị tách thành nhiều bin 4-bit cạnh nhau do khử răng cưa
   (đỏ = c80838 + d80838 + b80838...), không bin nào thắng 1,5 lần chính nó.
   clusterPixels giờ gộp bin láng giềnh (≤40) trước khi xếp hạng.
3. Giải pháp đo màu cho lane detector: kernelInkColor đọc NỀN từ hai dải sát
   trên/dưới hộp KERNEL (nền đúng của dòng: badge/band/trang), mực = cụm lớn
   trong kernel xa nền ≥70, và lấy median TỨP XA NHẤT của cụm (chống pha màu
   viền). DetectedTextLine/schema thêm inkBox (optional, D14) từ quad
   pre-unclip; processor lane truyền kèm. Hai lần thử sai có bằng chứng:
   đo-trên-inkBox-kiểu-vành và kernel-vs-annulus đều sai giả định nền, đã bỏ.

Kết quả tái đo OFFLINE trên đúng dữ liệu run-04 (0 quota, ghi trong
run-04-colorfix/provenance.json): 43/43 dòng đúng màu so với bảng
replay-10 (0 dòng rơi seed; "MIỄN PHÍ" đỏ trên badge vàng từng bị coi
sai là do bảng kỳ vọng trùng tên hai dòng). Render lại đủ 44/44 hợp đồng
hình học. comparison-run04-colorfix.png chờ owner soi. Unit test mới:
badge vàng chữ đỏ, kernelInkColor; khớp 193 test tasks + 284 desktop.
Còn giới hạn: dòng hai màu trong một hộp ("MÀ" trắng + còn lại vàng) vẫn
chỉ nhận một màu (cụm lớn); cần tách run màu khi nào owner yêu cầu.

### Detector lane DBNet vào sản phẩm (2026-11-12, owner duyệt "làm nốt vụ dbnet")

Xong phần tích hợp chính: model PP-OCRv4 det ONNX ghim SHA (trùng byte bản
benchmark 45/45) + op `det` trong sidecar Rust + tiền/hậu xử lý DB thuần TS
(`utility/textdet.ts`, tham số dịch đúng config RapidOCR) + lane processor
(detector tọa độ → 1 lượt classify trên ảnh chip số → lượt transcribe crop
không che chữ 36/sheet trần 5 → pairing nghiêm ngặt trước mọi chi phí →
cùng đuôi xóa nền + gate). Copy dialog: "up to 1 image + up to 6 reads".
Lane chỉ bật ở mode codex khi model tồn tại; mock CI vẫn đi lane đọc cũ.
Dày chữ: gộp vùng xóa vỡ hạt (mergeEraseRegions) + dựng lại cục bộ vùng bị
gate flag từ nền phẳng (repairRetainedRegions, tái dùng ảnh đã trả tiền);
hết cách thì no_output kèm tên dòng bị sót.

Hai bug hình học bắt được nhờ test mask tổng hợp + đối chiếu vùng tham chiếu:
unclip nhân nhầm tọa độ với khoảng nới; orient theo thứ tự đỉnh làm MẤT HẲN
hai tiêu đề lớn nhất (đỉnh đi phải-sang-trái, góc 180 bị coi dọc). Sau sửa:
109 dòng detect, 1/45 vùng tham chiếu không có hộp riêng (bị gộp cùng dòng).

Chạy thật trên ảnh owner (chi tiết + 4 run trong
`docs/private/real-runs/2026-11-12-textdet-e2e/`): run-01 thành công lúc
còn bug (34 dòng), run-02/03 thất bại trung thực ở gate (provider sót mực
vùng nhỏ, không retry, 3 đọc + 1 ảnh mỗi run) → sinh merge + repair;
run-04 THÀNH CÔNG: 109 detect / loại 65 dòng màn hình / 44 dòng design,
3 đọc + 1 ảnh, 136 giây, gate hết chữ qua, render 44/44 dòng đúng hợp đồng
hình học. Tổng chi phí 11 đọc + 4 ảnh. Gates xanh: build/test/typecheck,
smoke, crash-smoke, shot, text-smoke. Còn mở: owner chưa soi
comparison-run04.png bằng mắt; trần 15 giây so phông trên ảnh dày chờ
duyệt; Windows máy vật lý; tham chiếu 45 dòng là LLM-derived.

### Vòng sửa sau review chất lượng (2026-11-12, owner duyệt "sửa đi")

Review độc lập (17 điểm) kết luận đám thay đổi D22 trước đó là chùm thử nghiệm
không nhất quán, chặn merge. Đã sửa theo thứ tự chặn lỗi:

1. **Một luồng duy nhất cho sản phẩm và kiểm chứng.** Bỏ hẳn nhánh
   `locateDenseText` (LLM làm chủ tọa độ, 4 lượt đọc vùng, đã bị owner bác)
   khỏi processor; xóa luôn file + test. Chín script/file thử nghiệm bị bác
   (detector harness che chữ bằng chip số, xóa nền min/max, replay trích mực
   theo chênh lệch ảnh nền, heuristic font-coverage đo độ rộng suy glyph)
   chuyển sang `docs/private/real-runs/2026-11-11-deconstruct-detector/rejected-source/`
   kèm manifest SHA-256, không xóa bằng chứng.
2. **Hai nhánh xóa nền qua cùng một gate.** Processor giờ chạy
   `retainedTextRegions` cho CẢ nền dựng cục bộ lẫn nền provider; trước đó
   nhánh local được tin mặc định.
3. **Gate hết chữ bỏ phép đo màu.** `retainedTextRegions` đo tương phản biên
   nét (so 4 láng giềng ±2px giữa gốc và nền): chữ đổi màu nhẹ (shift RGB 20)
   hoặc seed màu sai không còn được coi là đã xóa. Test hồi quy cả hai ca.
4. **Chấm phông và vẽ phông cùng một hình.** Rút `rasterizeGlyphs` +
   `glyphScale` vào `glyph-raster.ts`; ranker dựng ứng viên bằng đúng biến
   đổi renderer sẽ áp (không còn chấm trên toCanvasElement bị cắt dấu rồi
   vẽ hình khác). `glyphScale`: co giãn đồng nhất, chỉ cho lệch hai trục tối
   đa 1,25x, vượt thì letterbox (hết hiện tượng kéo ngang chữ 2,5 lần phát
   hiện qua cổng shot); ranker bắt lỗi đo từng ứng viên, một phông dị không
   làm sập cả bộ so sánh.
5. **Ngân sách CPU có giới hạn.** `rankArtworkFonts` có trần 15 giây
   (FontComparisonBudgetExceeded), hết hạn giữ phông mồi + ghi chú trung
   thực; test phủ cả timeout lẫn cancel. Trên poster dày 45 dòng của owner
   bộ so phông CHẠM TRẦN và thoát đúng thiết kế (ghi trong replay harness):
   đổi đánh đổi có chủ đích, chưa owner duyệt ngưỡng.
6. **Bỏ rào nhóm phông.** Ranker không còn loại ứng viên theo nhóm
   serif/mono/viết tay của seed; mọi phông đo được cùng tranh bằng pixel
   (test: seed Georgia sai được sửa lại Be Vietnam Pro, IoU 0,47→0,97).
7. **Gate pixel lặp lại được, chạy thật Electron.**
   `pnpm --filter @oia/desktop text-smoke` (CI cả Ubuntu lẫn Windows):
   4 ca neo/serialize, xoay ±độ so với canvas độc lập (IoU 0,98), sửa sai
   nhóm phông, giới hạn biến dạng và cấp phát (raster quá 4MP bị chặn),
   timeout/cancel. Không dùng fixture riêng tư, không quota.
8. **Cổng shot D22 đổi neo theo lý do.** Chữ giá fixture bắt mực thật ở
   x≈181 trong hộp seed x=60; pin theo neo seed cũ sẽ thưởng cho việc đặt chữ lên nền
   trống. Đã pin neo đo được (181, 124,5) kèm comment lý do, theo tiền
   lệ fill #ffcc00→#000000.

Gates toàn xanh sau vòng sửa: build, test, typecheck (repo), smoke,
crash-smoke, shot, text-smoke (macOS thật). Harness render offline chạy qua
đúng `matchedDeconstructScene` production, ghi hash SHA-256 mọi đầu vào
(gốc/nền/texts/fonts.css) + ghi atom; từ chối ghi đè bằng chứng.

Còn mở (trung thực): tích hợp DBNet vào sidecar Rust chưa làm (vẫn nghiên
   cứu, owner đã duyệt kiến trúc detector); chưa có bộ ảnh đối chiếu độc lập
   nhiều bố cục; text-smoke Windows mới thêm vào CI, chưa chạy trên máy
   Windows vật lý; ngưỡng 15 giây chờ owner duyệt.

### Detector architecture chạy thật trên ảnh owner (2026-11-11, chiều)

Sau khi owner chốt đổi quyết định (cần tọa độ chính xác, LLM chỉ đọc nội dung
và kiểm chính tả), đã chạy chuỗi detector qua harness
`apps/desktop/scripts/deconstruct-detector-real.mjs` + `dbnet-detect.py` +
`cv-inpaint-erase.py`: DBNet cho 114 hộp, một lượt đọc vision trên ảnh phủ số
chip trong hộp (114/114 pairing), 43 dòng design giữ lại, 71 dòng chữ
màn hình/vật thể loại đúng chính sách. Plate provider xóa không sạch chữ
tiêu đề lớn theo phép đo cũ. **Đính chính sau khi owner yêu cầu mở ảnh:**
run-03-local KHÔNG ĐẠT, dù phép đếm màu báo 43/43: chữ cũ chỉ đổi màu, nền
bị phá và chữ mới lệch. Nhận định seed sai 43/43 không đáng tin vì phép đo
cũng nhầm nền với mực. Chưa có bằng chứng OpenCV lỗi: opening trên nét tối
có thể làm nét nở ra đúng định nghĩa, không được quy thành lỗi thư viện.

Owner duyệt sửa tiếp. run-04-crops đọc hai bảng ảnh cắt, số nằm ngoài ảnh:
44 dòng được đọc lại, khôi phục EM MỜI, TỰ ĐỘNG, AN TOÀN và dòng dễ dàng (ID
104 từng bị loại nhầm). Đây là lựa chọn phạm vi đã rà cho ảnh owner, chưa
phải bộ phân loại tự động mới. replay-10-residual dùng lại nền provider
run-02 (không tạo ảnh mới), chỉ inpaint mực tối sót trên thẻ trắng với ngữ
cảnh toàn ảnh; bỏ phép vá nền min/max đã thất bại. Màu và hộp mực đo từ
chênh lệch gốc/nền; loại mảnh dòng lân cận ở mép; tách dòng hai màu thành
45 lớp. Thử Roboto Condensed từ google/fonts, OFL, chỉ trong bằng chứng,
chưa đóng kèm sản phẩm.

Renderer đã sửa đo glyph trên canvas có đệm (toCanvasElement cắt dấu/độ
nhô chữ nghiêng); chữ sau serialize Textbox giữ nguyên hộp mực bằng scaleX/Y,
không để font ranking thay đổi kích thước hay dời hộp. Font có thể bị co giãn,
không cam kết giống bản gốc. Đã tự mở nền và bản dựng mới: hết các mảng vá,
chồng chữ nặng trước đó; độ đậm, dáng chữ và viền vẫn khác gốc. Phép kiểm
pixel từng lớp sau loadFromJSON: 45 lớp trong 3px so với hộp trích, chỉ chứng
minh renderer giữ hộp, KHÔNG chứng minh hộp detector hoặc OCR đúng hoàn toàn.
Regression lặp lại, offline, dùng font đóng kèm:
`node apps/desktop/scripts/deconstruct-geometry-smoke.mjs` (4 ca dấu/chữ
nghiêng/chữ nhỏ, sai lệch 1px). build, test, typecheck, desktop shot, smoke,
crash-smoke đều qua.
Chưa nghiệm thu Editor luồng detector và Windows, chưa thêm op Rust, chưa
phát hành. Chi phí detector tổng: 4 đọc + 2 ảnh, riêng vòng sửa này 2 đọc +
0 ảnh; các replay không trả phí. Bằng chứng riêng:
`docs/private/real-runs/2026-11-11-deconstruct-detector/`, xem
`replay-10-residual/reconstructed.png` và `RECHECK.md`.

### Nghiên cứu + thử nghiệm model phát hiện chữ riêng (2026-11-11, theo yêu cầu owner)

Sau khi SAM text-prompted chứng minh không đủ (mục dưới), owner yêu cầu research
HF và thử nghiệm model riêng. Đã chạy 5 candidate trên chính ảnh owner với
protocol chung (eval.py, tham chiếu 45 dòng LLM+refine, bằng chứng riêng
`docs/private/real-runs/2026-11-11-text-detectors/RESULTS.md`):
RapidOCR DBNet PP-OCRv4 mobile det (ONNX, Apache-2.0, trong wheel 14,9 MB) khớp
45/45 dòng trong 1,2 s; PP-OCRv5 det monkt HF 88 MB khớp 45/45 trong 1,1 s;
macOS Vision khớp 45/45 nhưng 26,4 s và chỉ macOS; EasyOCR CRAFT 44/45, cần
torch; Tesseract 33/45, sót hết tiêu đề cách điệu (xác nhận lại D15). Các
phát hiện thừa đều là chữ UI trong màn hình laptop/điện thoại, đúng phạm vi
cần lọc theo chính sách. Kết luận: CẦN model detection riêng, DBNet dòng
PP-OCR qua ONNX là ứng viên hợp nhất (Apache-2.0, offline, nhẹ, chạy bằng
ORT trong Rust sidecar như SAM). Kiến trúc đề xuất: detector cho hộp + quad +
bản đồ xác suất, LLM vision chỉ đọc nội dung từng dòng đã cắt, mặt nạ xóa từ
quad + màu mực. Thay đổi này chạm tính chất D15/D22 (thêm model OCR detection
vào app): CHỜ OWNER CHỖT trước khi viết code sản phẩm. Giới hạn: mới thử 1
ảnh, tham chiếu chưa phải ground truth, chưa soi overlay bằng mắt, chưa thử
DBNet++ server/PSENet/ảnh cong. Không đổi code sản phẩm, không commit.

### Kiểm SAM 3 trên chữ theo yêu cầu owner (2026-11-11)

Owner chỉ ra segmentation đã có, yêu cầu thử ngay trước khi đề xuất thêm mô
hình. Đã chạy Sam3Segmenter production + native sidecar + ONNX int8 có sẵn,
0 provider trả phí, không sửa code sản phẩm. Năm gợi ý trên ảnh gốc: woman
làm đối chứng đúng người; text bắt hai vùng chữ lớn; letters chỉ bắt ĐANG;
printed text chọn nhầm 97,47% ảnh; headline chọn nhầm đầu/tóc. Đã mở mặt nạ:
bao cụm chữ, không bám riêng từng nét. Thêm bốn lượt trên hai vùng cắt phần
dưới (text/words): bắt một số lời kêu gọi, vẫn bỏ sót hầu hết chữ nhỏ, sáu
cột tính năng và số điện thoại. Tổng 9 lượt khoảng 102,2 giây, native runner
được dừng sau mỗi phiên. Cấu hình hiện tại: score >0,5, cap 8, lưới mask 288;
không kết luận về mọi cấu hình/checkpoint SAM. Kết luận ca này: chưa thể lấy
SAM hiện tại làm bộ phát hiện đầy đủ chữ tự động. Bằng chứng riêng:
`docs/private/real-runs/2026-11-11-sam-text/RESULTS.md`, contact-sheet.png,
text/mask.png, crop-contact-sheet.png và report.json. Nhánh LLM tọa độ vẫn
WIP chưa phát hành; thử nghiệm này không chứng minh luồng thay thế đã xong.

### Sửa ca quảng cáo dày chữ của owner (2026-11-11, đang kiểm chứng)

Owner duyệt sửa sau khi ảnh so sánh hỏng. Ghi đè giới hạn một lượt đọc bên
 dưới cho ảnh dày chữ: dưới 12 mục vẫn một lượt đọc; từ 12 mục trở lên có tối
đa bốn lượt đọc vùng bổ sung (tổng tối đa 5 đọc + 1 ảnh), không tự thử lại.
Hộp vùng được ánh xạ về ảnh gốc; lượt đọc vùng phải giữ nguyên danh sách và
thứ tự chữ, sai thì dừng trước tạo nền. Dialog phải hiển thị trần mới.
Phạm vi mặc định là chữ thiết kế phẳng: bỏ chữ trong màn hình/vật thể chụp,
nhãn sản phẩm và logo. Đây là hướng dẫn vision, chưa phải bảo đảm phân đoạn.
Cùng danh sách chữ đã định vị được dùng để xóa nền và dựng chữ. Chặn nền
còn giữ phần lớn pixel mực gốc trong vùng chọn bằng lỗi `no_output`, giữ
checkpoint OCR, không tự retry; phép đo này không thay thế kiểm ảnh trực tiếp.
Bản dựng kiểm chứng dùng phông đóng kèm và hàm căn/khớp phông production;
bằng chứng mỗi lượt ở thư mục riêng, lưu final.json cùng plate. Không còn
chấp nhận bản dựng tạm thiếu phông, sai origin hoặc ghép chữ/plate chéo lượt.
Trạng thái: **WIP, chưa đạt chất lượng, chưa phát hành**. Đã sửa origin tường
minh, đọc lại vùng có kiểm nội dung/thứ tự, kiểm pixel trước chấp nhận hộp
vùng, giữ seed màu toàn ảnh, hạn chế hút nền/biểu tượng cùng màu, ghép vùng
xóa bao cả hộp gốc và hộp tinh chỉnh. Khớp phông chạy theo lô sáu mục đến hết
ảnh, không chỉ sáu mục đầu; loại ứng viên đổi nhóm serif/sans/mono/chữ viết
tay, kiểm thiếu glyph bằng metric fallback (heuristic, không phải cmap), giảm
ép spacing âm. Không tuyên bố khôi phục đúng phông hay xóa sạch mọi nét cũ.

Bằng chứng riêng: `docs/private/real-runs/2026-11-11-deconstruct-fix/`.
Bốn lượt task thật: run-01 lỗi provider không có ảnh (1 đọc + 1 ảnh), run-02
trả ảnh nhưng kiểm trực tiếp phát hiện tái dựng sai (4 đọc + 1 ảnh), run-03
và run-04 bị chặn bởi kiểm mực còn lại (mỗi lượt 4 đọc + 1 ảnh). Tổng ledger
của bốn lượt: 13 đọc + 4 ảnh. Không gồm các integration provider chạy trong
`pnpm test`. Sau các bản sửa, replay-12 chạy lại đầu ra provider đã lưu của
run-04 qua processor/renderer hiện tại, 0 quota mới. Đã mở ảnh: nền/vị trí
chính tốt hơn bản đầu, nhưng cột An toàn - Bảo mật vẫn chồng chữ, phần chữ
nhỏ còn lệch/sót nét, kiểu chữ chưa giống gốc. Replay `succeeded` không phải
đạt kiểm chất lượng. Chưa chạy task trả phí thành công nguyên luồng sau bản
sửa cuối; chưa nghiệm thu Editor thật với ảnh owner, chưa xác minh Windows.

Gates giữa phiên: build/typecheck/test toàn repo xanh, shot lần đầu bắt lỗi
refine sau lấy màu trên fixture xoay; đã sửa lại thứ tự refine rồi lấy màu,
shot chạy lại xanh. Gates cuối được ghi trong báo cáo WIP; không dùng các
gate này để phủ nhận ảnh kiểm trực tiếp vẫn thất bại.

Owner duyệt thực hiện sau D21. Nâng cấp luồng `deconstruct` hiện có, không thêm mô hình OCR và không thêm lượt trả phí: một lượt đọc ảnh bằng LLM, tối đa một lượt tạo nền sạch bằng nhà cung cấp hiện tại.

- OCR trả nội dung đúng dấu, hộp chữ trước xoay, góc xoay quanh góc trái trên, màu, họ phông gần nhất trong danh sách khả dụng, độ đậm, kiểu nghiêng, căn lề và spacing theo em. `typography` tùy chọn để đọc được kết quả cũ theo D14, nhưng schema gửi Codex yêu cầu đủ các thuộc tính. Không tuyên bố nhận diện chính xác phông gốc.
- Phông: Be Vietnam Pro và Instrument Serif đã đóng kèm; các họ sans-serif, serif, monospace dùng phông hệ thống và có thể khác giữa macOS và Windows. Chờ phông tải xong trước khi đo. Khớp cỡ và spacing bằng pixel chữ Fabric thật, tính cả dấu và phần chữ thòng xuống; không ép chữ chồng lên nhau để giả khớp.
- Màu: lấy cụm pixel gần màu LLM ước lượng trong vùng chữ gốc, không lấy màu phổ biến nhất của cả hộp (thường là nền). Nếu thiếu bằng chứng pixel thì giữ màu ước lượng.
- Xóa chữ: đối chiếu pixel gần màu chữ để hiệu chỉnh hộp OCR (bắt cả phần chữ thòng xuống), không nới hộp khi màu ước lượng thực chất chiếm phần lớn nền. Nền trơn hoặc chuyển màu tuyến tính được khớp mặt phẳng màu từ biên, kiểm lại pixel bên trong và loại pixel khử răng cưa theo hỗn hợp màu chữ/nền. Nếu mọi vùng đều đạt, tái tạo nền cục bộ, không gọi tạo ảnh. Nếu có vùng phức tạp, gửi nội dung/vùng OCR dưới dạng dữ liệu cho một lượt tạo ảnh; vùng trơn vẫn dùng công thức, vùng phức tạp dùng ảnh AI. Ghép trong các vùng xoay có đệm và mép chuyển mềm. Pixel ngoài vùng ghép và alpha ảnh gốc giữ nguyên; đầu ra khác kích thước được nội suy về kích thước gốc. Không bảo đảm cấu trúc bên trong vùng chữ nếu nền phức tạp hoặc công cụ tự dịch bố cục.
- PNG là đầu vào xử lý pixel của task, giới hạn 24 triệu pixel trước giải nén. Import desktop chuyển JPEG/WebP sang PNG cục bộ; editor đã xuất PNG. Gọi task trực tiếp với định dạng khác phải chuyển PNG trước, lỗi định dạng xảy ra trước quota. OCR rỗng giữ ảnh gốc và bỏ qua lượt tạo ảnh. Hủy sau OCR chặn lượt tạo ảnh tiếp theo, không tự thử lại.
- Giới hạn chủ động: chưa khôi phục chữ chuyển màu, viền chữ, bóng đổ, chữ cong hoặc biến dạng phối cảnh. Phông là xấp xỉ và có thể không khớp đồng thời cả chiều rộng lẫn chiều cao; phép đo không tự biến thành nhận diện đúng phông. Chưa kiểm phông hệ thống trên Windows; gate mock không chứng minh chất lượng OCR/tạo nền.
- Kiểm chứng: build/test/typecheck, smoke, crash-smoke và shot trên macOS. Shot D22 đo pixel chữ (cao, vị trí xoay, một dòng, màu và góc -8 độ), gồm tiếng Việt. Mẫu chữ nhỏ lộ lỗi thanh công cụ vượt mép trái, đã kẹp lại theo canvasArea, gate R4/R5 tái hiện rồi qua.
- Mẫu thật: chạy task deconstruct qua ServiceContext có bộ đếm quota và giới hạn 1 đọc/1 ảnh, thành công trong 57.924 ms, đúng 1 đọc + 1 ảnh, không thử lại. Kết quả OCR đọc được hai dòng tiếng Việt rõ và SALE 50% trên nền họa tiết. Lần ghép đầu lộ lỗi hộp cắt đuôi chữ và mảng màu lệch; đã sửa bằng hiệu chỉnh hộp và khớp nền trơn, kiểm lại bằng cách ghép lại đầu ra OCR/ảnh đã lưu (0 lượt trả phí mới). Mẫu ghép cuối không còn các đuôi chữ thừa và mảng chữ nhật lệch màu nhìn thấy ở phần nền trơn; nền họa tiết trong vùng xóa vẫn là ảnh AI tái tạo, không bảo đảm đồng nhất bản gốc. Chưa chạy lại nguyên task trả phí sau sửa. Đánh giá bổ sung bằng renderer thật trên OCR/plate đã lưu: IoU hộp chữ trung bình 0,9268 nhưng IoU mặt nạ glyph tham khảo chỉ 0,2328, quan sát trực tiếp xác nhận sai họ phông (serif khác Georgia, sans thay chữ viết tay, monospace đậm khác Courier). Vì vậy chưa đạt mức bảo toàn hình dáng chữ. Ngoài vùng sửa có 0/998.997 pixel đổi; MAE nền tại pixel chữ cũ trên 5 dòng nền trơn giảm từ 6,8008 xuống 0,1167 (thang 255, tham chiếu gradient nguồn cùng hàng). CER 3/61 = 4,92% trên 5 dòng không có ô thiếu glyph; đây là một mẫu, không phải benchmark đại diện. Phương pháp/ngưỡng/giới hạn ghi trong METRICS.md, metrics.json và comparison.png ở thư mục bằng chứng. Bằng chứng riêng tư: `docs/private/surgepix-feature-audit-2026-11-09/d22-live/`.

### D22/D23: sửa chữ dính trên mẫu landing sau kiểm ảnh trực tiếp

Owner phát hiện bản landing chữ chồng dòng và huy hiệu dính. Đánh giá đạt trước
đó bị rút: script render lại đã lấy nhầm ảnh đầu vào để đo phông; hộp OCR nới
40% chiều cao còn bắt dòng bên cạnh và khung trang trí cùng màu. Sửa
`refineTextRegions`: tách các dải hàng mực qua khoảng trống, giữ dải có nhiều
mực nhất giao hộp OCR, giới hạn nới ngang và loại hàng thưa do khung dọc.
Bảng ứng viên bỏ dấu phân cách đứng riêng khỏi hạn mức sáu dòng. Vẫn có giới
hạn: không giải quyết hai dòng không có khoảng trống hoặc hộp OCR nằm sai
hoàn toàn; không phải bộ phân đoạn bố cục tổng quát.

Tái dựng từ OCR/plate cũ, đúng ảnh nguồn, 0 quota mới; mở xem trực tiếp ảnh
cuối: tiêu đề và huy hiệu không còn dính. SSIM toàn ảnh 0,9500 trên một poster
synthetic; không suy rộng thành benchmark. Demo sửa ngày cần nới hộp chữ vì
câu dài hơn, caption landing ghi rõ, không tuyên bố tự giữ một dòng khi chỉ
gõ. Chi tiết `docs/verification/marketing-assets.md`. Gate: tasks 158/158
(gồm regression hai dòng cùng màu, dấu rời và khung dọc), desktop 219/219,
desktop typecheck/build, tasks build, shot, smoke, crash-smoke và kiểm
tham chiếu media đạt. Chưa kiểm Windows thật hay chạy lại nguyên task trả phí.

### D22: sửa chữ trong sản phẩm, không nới hộp bằng script demo

Owner yêu cầu kết quả sửa ngày/giá phải do code app tạo ra. Các dòng khôi phục
có một dòng được gắn `recoveredTextLine: true` (thuộc tính scene tùy chọn,
không migration). Khi người dùng gõ, editor đo chiều rộng dòng bằng Fabric và
chỉ nới hộp khi cần, không đổi cỡ/phông/vị trí/góc. Dấu xuống dòng do người dùng
nhập được giữ nguyên. Textbox thường không đổi hành vi wrap. Marker sống qua
save/reload/clone. Không cam kết tránh mép artboard hoặc tránh các layer bên
cạnh khi nội dung dài tùy ý; đây là giữ một dòng, không phải tự dàn trang.

Kiểm chứng phải đi qua `createEditor` và sự kiện nhập của textarea Fabric,
không cho harness tự set chiều rộng. Gate shot kiểm gõ câu dài, save/reload,
xuống dòng tường minh và textbox thường. Mẫu landing phải được xuất lại qua
cùng editor, không còn bước nới hộp thủ công trong script.

Đã kiểm: gate nhập textarea trong Electron shot đạt một dòng sau gõ câu dài,
giữ cỡ/vị trí/góc, marker sống qua reload và clone; Enter xuống dòng và textbox
thường vẫn wrap. Khắc phục lỗi constructor Fabric không nhận trường `type`
chỉ đọc từ JSON; chỉ truyền các thuộc tính phông vào đối tượng đo. Dùng probe
Textbox để xác nhận wrap thật vì đo Text thuần không đủ khi tracking khác 0.
Asset landing đã xuất lại qua `createEditor`, script chỉ nhập textarea và xuất
PNG, mở xem trực tiếp không chồng chữ. Gates `pnpm test`, `pnpm typecheck`,
package build, desktop build/shot/smoke/crash-smoke và media check đều đạt.
Không thêm lượt trả phí; chưa kiểm Windows thật.

## D23: khôi phục phông bằng Lens chạy local (owner duyệt "lấy đi")

Nâng cấp tiếp của D22, thay phần đoán tên phông bằng mô hình phân loại phông. Kiến trúc: OCR trả nội dung vùng chữ (như D22) → **task `recognize-fonts` chạy Lens ONNX local trong utility process (0 quota)**, trả tối đa 3 ứng viên mỗi dòng kèm bytes phông OFL + tệp giấy phép đã lưu vào store → renderer tải phông bằng FontFace, ghép vào bảng ứng viên → **thứ hạng pixel quyết định** (thử phông/độ đậm/spacing, chấm IoU mặt nạ; chỉ nhận khi tốt hơn baseline rõ ràng, không bao giờ ép nhận phông tệ hơn). Khi Lens tự tin (điểm ≥ 0,5 trên mọi dòng) thì **bỏ hẳn lượt đọc LLM thứ hai**; không tự tin mới dùng bảng ảnh đúng nội dung OCR qua task `match-fonts` cho LLM chọn tối đa 3 ứng viên/dòng. Font bytes + giấy phép sống trong store, đi theo scene qua `fontSource` (customProperties), tải lại khi mở dự án, sống sót qua asset GC vì `fontSource.url` là khóa uploads/... Chỉ chọn phông OFL, tệp giấy phép lưu cạnh bytes.

Nguồn mô hình: **mixfont/lens, commit dcbc882, ~45MB ResNet18, 983 họ phông**. KHÔNG chạy mã Python của tác giả lúc runtime: chỉ xuất ONNX một lần lúc build (`pnpm --filter @oia/desktop prepare-lens`, tải từ raw.githubusercontent.com pin sha256, trọng số không vào git), suy luận bằng onnxruntime-node có sẵn (CPU, ~1,3 giây cho 6 dòng). Tiền xử lý viết lại thuần TS (bicubic + pad màu biên + chuẩn hóa ImageNet, tách từ dài nhất theo mặt nạ màu, không cần Tesseract). GATE AN TOÀN: giấy phép repo gốc **cấm dùng thương mại nếu không có chấp thuận bằng văn bản**; owner quyết định dùng cho mục đích phi thương mại; NOTICE.txt ghi công đi kèm build (extraResources resources/lens). Nếu sau này thương mại hóa: xin giấy phép hoặc bỏ Lens; bảng ảnh + match-fonts vẫn chạy không cần Lens.

Hạn chế ghi nhận: tải phông OFL lần đầu (~0,1-1,8MB/phông, lưu vĩnh viễn vào store, giới hạn 5MB/tệp, chặn host ngoài static.mixfont.com/raw.githubusercontent.com); chỉ nhận diện phông trong tập huấn luyện (phông độc quyền trả về phông mở gần nhất); bảng 983 họ là tuyên bố của tác giả, chưa kiểm chứng độc lập.

**Kiểm chứng (mẫu tiếng Việt test-input-vi.png, tái lập bằng OCR/plate đã lưu, 0 quota mới):**
- Lens đề xuất đúng hướng: dòng Georgia → **Gelasio** (phông thay thế metric của Georgia, điểm 0,68); dòng chữ viết tay → Patrick Hand; dòng khó điểm thấp trung thực (0,003-0,04%).
- Thứ hạng pixel: dòng 1 mặt nạ glyph IoU **0,315 → 0,591** (+87%), hộp giữ 0,945; đề xuất sai (Scope One cho dòng monospace) bị **từ chối**, giữ baseline; trung bình mặt nạ 6 dòng 0,2328 → 0,2789 chỉ nhờ một dòng được thay đúng.
- Gates: build/test (219 desktop + 148 tasks)/typecheck/smoke/shot đều đạt; 8 unit test mới (tiền xử lý Lens, checksum, tải phông + giấy phép, phông hỏng bỏ qua an toàn, host lạ bị chặn, thiếu build → capability_unsupported, hủy giữa chừng AbortError).
- Bằng chứng riêng tư: `d22-live/comparison-d23.png`, `lens-scores.json`, `reconstructed-lens.png`, `glyph-lens-*.png`.

Chưa làm: chạy task `deconstruct` thật từ đầu đến cuối qua UI (mới kiểm chứng từng tầng + harness render dùng đúng hàm production); phông Lens trên Windows (Menlo/Consolas khác nền tảng, ảnh hưởng danh sách phông cài sẵn); chưa đo thời gian rank trong UI thật.

**Rà soát luồng thực tế sau D23 (2026-11-09): chưa đạt, có lỗi tích hợp chặn D23.** Chạy ServiceContext thật có quota + hàm `matchedDeconstructScene` production trong Electron (không phải thao tác nút UI). Lần đầu từ ảnh gốc: OCR thành công nhưng tạo nền trả `no_output`, task deconstruct thất bại; không thử lại. Sau đó tái dùng OCR/plate D22 để kiểm riêng đoạn khớp phông: `recognize-fonts` và `match-fonts` đều trả kết quả handler nhưng TaskStore đánh thất bại vì `finalDownload()` đọc `urls[0].replace(...)` khi hai handler trả `urls: []`. Lượt match-fonts đã tiêu thụ 1 lượt đọc thật (~6,9 giây) trước khi kết quả bị mất ở lớp đóng gói. Renderer giữ baseline D22 với cảnh báo, cả 6 ảnh glyph giống D22 từng pixel, IoU trung bình vẫn 0,2328 chứ KHÔNG phải 0,2789. Số 0,2789 ở trên chỉ là thử nghiệm Lens shortlist riêng, bỏ qua nhánh chọn LLM thật; không chứng minh chất lượng luồng tích hợp. Phiên kiểm riêng phông mất ~18,5 giây tính cả tải tài nguyên và dựng scene. Test trước chỉ gọi handler, không đi xuyên TaskStore nên bỏ sót lỗi này. Chưa sửa trong lần rà soát. Bằng chứng: `docs/private/surgepix-feature-audit-2026-11-09/quality-current/` (deconstruct.json, ocr.json, fonts.json, result.json, glyph-comparison.json, comparison.png và data/task-log.jsonl).

### D23b: bỏ LLM khỏi khớp phông, Lens + chấm pixel quyết định (owner chốt)

Research bên ngoài xác nhận hướng: VLM yếu nhận diện phông (arXiv 2503.23768: VLM thất bại benchmark 15 phông, few-shot/CoT không giúp; David Ferris 12/2025: VLM "siêu nhân ở OCR nhưng tệ ở nhận diện phông, weight/size/kerning khỏi bàn"). Mọi bên chuyên nghiệp đều dùng classifier chuyên dụng trả DANH SÁCH XẾP HẠNG chứ không trả một phông duy nhất: WhatTheFont (kho 400k+), Mixfont Lens API (chính là model mình dùng, "isolates the strongest text sample, returns a ranked shortlist"), DeepFont (Adobe 2015, 80%+ top-5 kèm độ đo tương đồng), FasterViT-2 (SOTA 87,4% AdobeVFR). Ferris cũng thấy Instrument Serif lẫn STIX Two Text, đúng hiện tượng bảng của mình gặp. Nguồn: arxiv.org/abs/2503.23768; david-ferris.medium.com (font-detection-benchmarking-vlms); mixfont.com/font-recognition-api; research.adobe.com/publication/deepfont.

Thay đổi: `matchedDeconstructScene` không còn gọi task `match-fonts`; mọi ứng viên (phông OCR ban đầu + tối đa 6 đề xuất Lens + phông hệ thống trong DECONSTRUCT_FONTS) đều được đo. `rankFontReferences` viết lại: chấm thô từng phông×độ đậm (điểm Lens cố định weight), hàm chấm mới `fontMaskPlacement` cho phép dịch vị trí ±2px để đặt glyph đúng chỗ (trước đây lệch 1-2px tự trừ điểm), tinh chỉnh 4 phông tốt nhất bằng coordinate descent trên fontSize×charSpacing 2 lượt; `DeconstructFit` thêm offsetX/offsetY áp vào vị trí khi dựng scene. UI copy: "Up to 1 image + 1 read; font matching runs locally". Task `match-fonts` GIỮ cho loopback API (contract ổn định), không còn nằm trong luồng UI.

Đo trên cùng mẫu test-input-vi.png, tái dùng OCR/plate D22 (0 quota, đúng hàm production trong Electron): IoU mặt nạ glyph trung bình **0,2328 → 0,5249** với OCR gốc (6/6 dòng cải thiện: 0,3146→0,7185; 0,2746→0,7089; 0,1562→0,4484; 0,2888→0,4720; 0,1798→0,2739; 0,1827→0,5278); **0,5866** nếu sửa đúng nội dung chữ (0,5761 / 0,5162 ở 2 dòng OCR sai dấu). Nhìn bằng mắt: dòng Georgia khôi phục gần giống bản gốc, phông chọn là Georgia/Chalkboard/Courier New hệ thống (đo pixel thắng, không cần đúng tên phông gốc). Thời gian khớp phông ~13-21 giây CPU, 0 lượt đọc. Bằng chứng: `quality-local/`, `quality-local-corrected/` (result.json, metrics.json, comparison.png).

**Đo lại theo thang chuẩn ngành (SSIM vùng chữ giữa ảnh gốc và bản tái dựng cuối, cách paper scene text editing chấm): trung bình 0,692 (D22) → 0,849 (bản mới)**; theo dòng: 0,700→0,891; 0,698→0,885; 0,616→0,783; 0,728→0,872; 0,780→0,859; 0,631→0,802. Nằm trong vùng 0,7-0,9 các method dẫn đầu báo trên nền sạch. Từ nay số liệu chất lượng chữ báo bằng SSIM chuẩn này; IoU mặt nạ tự chế chỉ dùng làm hàm mục tiêu nội bộ của bộ tối ưu (nó khắt khe với lệch 1px và khử răng cưa nên số thấp hơn hẳn thang ngành, nghiên cứu gần đây cũng phê bình PSNR/SSIM vì cùng kiểu nhạy). Đối chiếu ngành: nhận diện phông chấm top-1/top-5 trên AdobeVFR (FasterViT-2 SOTA 11/2025: 87,4%/92,1% ảnh thật; DeepFont >80% top-5; Ferris tự train 74%/85,3%); chỉnh sửa chữ chấm SSIM/PSNR/MSE/FID vùng chữ + LPIPS; OCR chấm CER/WER. Cảnh báo từ fontina: 88,5% trên synthetic validate nhưng 5% top-1 trên ảnh thật, không tin số synthetic.

**Màu chữ: pixel là chính, LLM chỉ là dự phòng (owner duyệt "màu thì cần gì LLM").** `sampleTextColors` viết lại: nền cục bộ = median vành ngoài hộp xoay; pixel mực = pixel xa nền ≥70 (loại band khử răng cưa); trong các pixel mực lấy cụm trội (bin 4-bit, tối thiểu 8 pixel và ≥1,5 lần cụm nhì) rồi median từng kênh; không đo được (hộp xấu, tương phản thấp) mới giữ ước lượng LLM. Lỗi gặp giữa chừng và đã sửa: median mù trên chữ trắng nền họa tiết trả về màu rác (#f6cac1 thay vì trắng), cụm trội + tiêu chí thống trị tương đối khắc phục. Trên ảnh thật: 6/6 dòng khôi phục ĐÚNG byte màu gốc (rgb-dist 0,0), tốt hơn bản mồi-LLM (dE76 0,86). Shot gate D22 đổi kỳ vọng fill #ffcc00 → #000000 kèm lý do trong comment: fixture thật có chữ giá đen, mock seed vàng là mồi sai, gate ghim hành vi đo đúng (đổi theo quyết định, không che giấu). 5 unit test mới: mồi sai được sửa, nền gradient, tương phản thấp fallback giữ ước lượng, chữ trắng trên texture nhiều màu, giữ ước lượng khi không có mực. `fill` vẫn nằm trong schema/prompt (dự phòng), không đổi wire.

**Hình học (kích thước + vị trí), đo bằng hộp bao pixel chữ:** vị trí lệch tâm trung bình 1,35px → **1,15px** trên ảnh 1000×1200 (dòng lỗi nhất của D22 lệch 4,5px → 0,7px nhờ placement search ±2px); tỷ lệ rộng 0,996 (gần chuẩn), tỷ lệ cao 0,944 (D22: 0,985): cao bị thấp ~6% một cách có hệ thống, phần lớn là thiên lệch phép đo (mặt nạ nguồn bắt được mép khử răng cưa, mặt nạ render dùng alpha ≥200 khắt khe hơn) cộng khác biệt x-height giữa phông chọn và phông gốc; IoU hộp trung bình 0,934. Offset vị trí được ghi vào left/top của đối tượng (thuộc tính chỉnh sửa được bình thường, không phải hack ẩn). Chi tiết: `quality-local/geometry.json`.

Thực nghiệm OCR crop (2 lượt đọc thật, owner hỏi): gửi ảnh toàn trang, model đọc sai "chơi" thành "chợ"/"chℓi" ở 2 lần chạy; crop dòng về độ phân giải gốc 420×83 → đọc đúng 100% "ghé chơi nha". Dòng chữ Courier nhỏ có dấu chồng: crop + phóng 3x vẫn sai dấu ("Ước ưỡ y đẵng"). Owner chốt: bỏ trường hợp dòng Courier nhỏ đó ("ko có trường hợp ntn đâu"), không làm two-pass crop OCR hay từ điển dấu trong đợt này, chi phí giữ nguyên tối đa 1 ảnh + 1 lượt đọc. Ghi nhớ nếu sau này cần: lỗi OCR dấu ở dòng to có thể sửa bằng 1 lượt đọc crop ghép, cơ chế phát hiện bằng chính IoU pixel đã có.

**Chốt (2026-11-09): chạy thật end-to-end 1 lần từ ảnh gốc, CHUỖI ĐẦY ĐỦ THÀNH CÔNG.** Task `deconstruct` thật qua ServiceContext + Codex: 1 lượt đọc + 1 ảnh, đúng con số dialog, không retry, không chạm limit, tổng ~97 giây (gồm tạo nền + Lens + khớp phông + dựng scene). `no_output` lần trước không tái xuất (1 lần thất bại trên 2 lần gọi tạo nền, chưa đủ dữ liệu tần suất, đã có cơ chế giữ OCR). Kết quả đo bản dựng lại từ artifact thật (0 quota mới): SSIM vùng chữ từng dòng 0,885 / 0,891 / 0,729 / 0,877 / 0,738 / 0,887, trung bình **0,8345**; màu 6/6 dòng đúng từng byte; phông chọn Georgia×3, Chalkboard, Courier New×2 (đo pixel thắng). OCR lần này sai khác lần trước (dòng viết tay có ký tự ô thiếu, dòng dấu Việt mất một từ → maskIoU dòng đó 0,08), xác nhận giới hạn đã ghi: chất lượng cuối phụ thuộc OCR dấu tiếng Việt. Plate lần này sót 3976 pixel chữ cũ ở vùng SALE họa tiết (bản D22 sót 125): tạo ảnh AI có phương sai trên nền phức tạp, đã ghi là giới hạn từ D22. Lỗi race tải ảnh nền trong harness đo đã sửa (chờ image ready) và ghi nhận: app thật đi oia:// URL, không dính đường data-URL lớn. Bằng chứng: `e2e-real/` (deconstruct-task.json, plate.png, result.json, reconstructed-fixed.png, glyph-fixed-*.png, rerender.json). Trạng thái: **D22 + D23 đóng trên macOS**. Nợ còn mở: kiểm máy Windows thật (phông hệ thống + quy trình đầy đủ), đo tần suất lỗi OCR dấu trên bộ mẫu lớn hơn nếu sau này cần tăng chất lượng (crop re-read đã có bằng chứng nguyên lý, owner tạm gác), tích lũy mẫu thật nhiều hơn 1 ảnh trước khi tuyên bố số liệu đại diện.

- Task dữ liệu `recognize-fonts`/`match-fonts` thành công không cần tệp tải xuống: TaskStore giữ `fontSuggestions`/`fontMatches` và bỏ trường `download`. Task ảnh không có tệp vẫn thất bại, không tạo URL giả. Kiểm thử gọi handler thật qua TaskStore và ghi/đọc lại log, không chỉ gọi handler độc lập.
- `deconstruct` lưu checkpoint OCR đã hiệu chỉnh trước khi tạo nền. Nếu tạo ảnh trả `no_output`, hủy hoặc tiến trình dừng, record giữ chữ nhưng vẫn failed, không gắn ảnh gốc thành nền sạch. UI giữ trang cũ và thông báo cả nguyên nhân lẫn phần OCR được lưu. Không tự thử lại; checkpoint không phải lối tiếp tục miễn phí đã có UI. Abort từ tín hiệu TaskStore ghi `errorClass: cancelled`, không `unknown`.
- Chạy lại `matchedDeconstructScene` production trong Electron với TaskStore + Lens thật + một lượt Codex `match-fonts`, tái dùng OCR/plate D22: cả hai task thành công, không fallback. Thời gian ~19,1 giây (lượt đọc ~8,6 giây), 1 đọc + 0 ảnh. IoU mặt nạ chữ theo cùng phép đo D22 tăng **0,2328 → 0,3391** (5 dòng cải thiện, 1 dòng giữ nguyên): dòng 1 0,3146→0,5911; dòng 2 0,2746→0,4104; dòng 3 0,1563→0,2577; dòng 4 0,2888 giữ nguyên; dòng 5 0,1798→0,2125; dòng 6 0,1827→0,2742. Chưa đạt bảo toàn phông gốc, chưa phải benchmark đại diện.
- Build/test/typecheck/smoke/crash-smoke/shot đã chạy sau sửa tích hợp. Bằng chứng riêng tư: `quality-fixed/result.json`, `metrics.json`, `comparison.png`, `data/task-log.jsonl`; script `quality-run.cjs` + `quality-entry.mjs` gọi trực tiếp hàm production, không thao tác nút UI.
- `no_output` từ lần tạo nền trước chưa đủ bằng chứng để chốt do công cụ không chạy hay bộ tìm tệp bỏ sót. Không sửa bừa nhà cung cấp và không gọi tạo ảnh thêm trong đợt này. Đã sửa khả năng giữ OCR khi lỗi; chưa chứng minh cả luồng tạo nền thật sẽ thành công và chưa kiểm Windows thật.

## Loopback API spec (D9: đầy đủ, hấp thụ review điểm 3)

- **Transport**: `node:http`, bind **chỉ 127.0.0.1**. **Port random** + ghi **discovery file** `<userData>/agent-api.json` (quyền 0600) chứa `{port, pid}`; xoá file khi tắt. Skill script: đọc discovery file trước, `OIA_BASE_URL` override sau.
- **Chống DNS rebinding / browser**: validate `Host` header == `127.0.0.1:<port>`; **từ chối mọi request có `Origin` header**; KHÔNG bao giờ trả `Access-Control-Allow-Origin`. Key chỉ nhận qua `Authorization` header, không qua query string.
- **Auth**: API key BẮT BUỘC mọi route. `apiKeyStore` đã hash sha256, giữ nguyên; plaintext chỉ hiển thị 1 lần khi tạo (panel For Agents: tạo/xem preview/thu hồi).
- **Routes**: `POST /api/tasks/{type}` submit, `GET /api/tasks/{id}` poll, `POST /api/tasks/cancel`, `POST /api/upload/direct`, **`GET /api/files/{key}` (có auth)**: vì `oia://files` chỉ dùng được trong Electron; agent ngoài fetch qua HTTP loopback này.
- **Quota bảo vệ**: giới hạn concurrency **mỗi provider** (Codex = 1 job chạy đồng thời) + rate limit mỗi key; job do agent tạo **hiển thị trong UI desktop** (nhãn "agent") để owner thấy ai đốt quota.
- **Giới hạn upload** (max body size, ví dụ 50 MB, chốt khi implement). **Khi app đóng**: server tắt, agent nhận `ECONNREFUSED`, ghi rõ trong SKILL.md.
- Envelope `{code, data, msg}` + TTL 24h giữ nguyên → 15 skill không sửa logic.

## Cây thư mục đích

```text
oia/
├── package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├── .env.example               # chỉ còn provider (CODEX_*, OPENAI_*, FAL_*), infra chết đã dọn ở bước 3
├── config/                    # (tối giản, học Orca nhưng không nhân bản)
│   ├── knip.json              # dò code chết (đã tận dụng 1 lần với packages/db)
│   └── baselines/             # ratchet: số nợ chỉ được GIẢM. Hiện 1 metric
│       └── oia-web-imports.baseline.txt   # = 0 (khởi tạo 5 ở bước 2, về 0 ngay)
│                              # metric mới (any, @ts-ignore, TODO) thêm khi nợ xuất hiện
│
├── apps/
│   └── desktop/               # shell duy nhất
│       ├── src/
│       │   ├── main/          # index, runtime + (mới) updater, rembg integration
│       │   │                  #  , KHÔNG còn chứa services (D11: sang utility process)
│       │   ├── utility/       # (mới, D11) node task entry: ServiceContext,
│       │   │                  #   runChat, loopback API server, spawn CLI
│       │   ├── preload/       # contextBridge hẹp, zod-validate
│       │   ├── renderer/
│       │   │   ├── views/     # Home, Editor, Workspace (đã có) + Tools.tsx, BrandKit.tsx
│       │   │   ├── components/# + ToolRunner, BrandKitForm, ForAgentsPanel
│       │   │   ├── lib/       # tools-registry, studio-templates, studio-ui,
│       │   │   │              #   provider-errors, i18n (TRIM en-only, D8)
│       │   │   ├── fonts/  public/
│       │   └── shared/        # bridge, channels, ipc + IPC tools/brandkit/agent-jobs
│       ├── resources/         # icons .icns/.ico, bin/ theo platform, model rembg (nếu bundle)
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml  # mac arm64 + x64 (x64 không tốn phí, chỉ tốn CI;
│       │                      #   cân nhắc universal), win x64 NSIS
│       └── test/
│
├── packages/                  # giữ nguyên hướng phụ thuộc
│   ├── schema/                # SCENE_VERSION + OIA_SCHEMA_VERSION (đã có, bước 1)
│   ├── protocol/  agent/  canvas/  services/
│   ├── providers/             # cli/ nâng theo process-host pattern:
│   │                          #   cmd-shim resolution, tree-kill, PATH từ GUI launch
│   └── tasks/                 # queue in-process thuần (bullmq/ioredis đã xóa ở bước 3)
│                              #   + (mới) concurrency limiter theo provider + đánh dấu
│                              #   job "processing" bị gián đoạn khi load lại
│
└── docs/                      # giữ; dọn docs/private/ui-audit khi xóa web
```

## Bỏ (kèm lý do)

| Bỏ | Lý do |
|---|---|
| `apps/web` | D1. Xóa ở bước 6, SAU khi cắt phụ thuộc ngược (xem B2) |
| `packages/db` | 0 import (đã verify bằng grep) |
| `docker/`, Redis CI, `bullmq`, `ioredis` | Chỉ phục vụ worker, ĐÃ XÓA ở bước 3 |
| Share link `p/[id]` (web) | Tính năng server; desktop thay bằng export file trực tiếp, không có nhu cầu link công khai khi không có host |
| UI skills/docs trên web | Trang web tĩnh; `packages/skills` GIỮ theo D9 |
| Tool OCR (ai-image-editor) + tesseract.js + allowance jsdelivr + job ocr-nightly | D15 (2026-11-01): B1 deconstruct đã thay OCR bằng vision model; tool rời không còn người dùng, dọn luôn origin mạng duy nhất của renderer (fully offline) |

## Phát hiện review quan trọng (không được quên)

- **B2: CHẶN (đã xử lý ở bước 2):** desktop từng import `@oia-web/libs` ở 5 chỗ, xóa web trước khi cắt là gãy build.
- Windows path parsing Codex ĐÃ sửa (`parseImagePathHint` đủ POSIX/`C:\`/`C:/`; `provision.ts` biết `.cmd/.exe/.bat`), còn thiếu gate máy thật.
- `services`/`tasks` sạch Next.js, chuyển IPC an toàn.
- Desktop đã có `files:upload` IPC + `oia://files` protocol, nền tool port đã sẵn.
- Editor desktop 988 dòng ≥ web 890, port đã dày, chỉ cần checklist parity.
- rembg: pip đặt `rembg.exe`, spawn `.exe` trực tiếp được; rủi ro PATH GUI ≠ terminal, đã có error hướng dẫn. **Bundle rembg quyết CÙNG signing ở bước 7** (binary kèm app đều phải ký khi notarize; model ONNX + Python runtime có thể nặng hàng trăm MB).
- **PATH macOS từ GUI (review điểm 5):** mở từ Finder/Dock không kế thừa shell PATH, codex qua nvm/Homebrew sẽ không thấy. Cần resolve login-shell env (shell-env pattern) hoặc dựa vào managed install của runtime panel.

## Checklist thực thi (thứ tự bắt buộc)

**Bước 1, Quick wins schema** ✅ XONG (2026-10-30, commit `b5d383a`)
- `SCENE_VERSION` hằng số trong `@oia/schema`, thay 5 chỗ `"7.3.1"`. `OIA_SCHEMA_VERSION` riêng của Oia (bước 1 đặt = 1). Đồng bộ Fabric 6.9.1 toàn repo.
- Gate: `pnpm build && pnpm test` xanh. ✅

**Bước 2, Cắt phụ thuộc @oia-web (CHẶN)** ✅ XONG (2026-10-30, commit `cfae314`)
- 4 file libs copy vào `renderer/lib/`; bỏ alias `@oia-web`; baseline ratchet = 0 + CI guard.
- Gate: grep 0, typecheck/build, 22 test, smoke Electron thật (`DESKTOP_SMOKE OK`). ✅

**Bước 3, BullMQ purge** ✅ XONG (2026-10-30, commit `9f85daa`; `apps/worker` + `docker/` xóa sớm vì worker phụ thuộc BullMQ)
- Queue in-process thuần; bỏ deps bullmq/ioredis; CI bỏ Redis; `.env.example` dọn infra chết.
- Gate: 28 task test+typecheck xanh không Redis; smoke OK. ✅

**Bước 4, Port Tools + BrandKit + Loopback API + Utility process (D9, D11)**
- **4a. Utility process** ✅ XONG (2026-10-30): ServiceContext/runChat/taskStore vào `src/utility/`; RPC có rid + chat event routing về đúng WebContents; renderer contract không đổi; crash services không giết window. Gate: smoke events=9 + SHOT full qua utility thật.
- **4b. Loopback API** ✅ XONG (2026-10-30): server `node:http` trong utility, bind 127.0.0.1, port random + discovery file 0600; Host validation + chặn Origin + không CORS + key chỉ qua header; `/api/files/{key}` có auth; rate limit 20 submit/5 phút/key; codex guard 1 job; agentJob events; 9 test e2e loopback (security gates + envelope + upload multipart + poll 404). Skill scripts: tự đọc discovery file khi thiếu OIA_BASE_URL (check pid sống, skip file stale); sửa bug lộ ra: generate-poster schema không nhận `language` (script gửi thừa từ trước). Gate e2e thật: skill script chạy → discovery → auth → mock generation → download 200/401 đúng.
- **4c. Tools view** ✅ XONG (2026-11-06): `views/Tools.tsx` + `components/ToolRunner.tsx`; `lib/tools-registry.ts` copy từ web (desktop sở hữu bản sao). 4 đường fetch → IPC: upload→`uploadAsset`, tasks submit/poll→`submitTask`/`getTask`/`cancelTask` (noWait:false + poll 2s, không treo RPC 30s trên generation 1-6 phút), projects→`createProject`; download anchor→`saveExport` (dialog native). G3 guard cho lane IPC trích xuất thành `utility/guardedTaskSubmit.ts` dùng CHUNG với loopback (reserve đồng bộ + settle exactly-once + fallback TTL + dispose), loopback refactor sang dùng chung, 9 test e2e loopback xanh xác nhận hành vi giữ nguyên. Deps mới: heic2any, pdfjs-dist (worker emit asset tương đối, sống dưới file://), tesseract.js (CDN lần đầu như web). Sửa kèm bug schema: `logos` của brandkit chỉ nhận URL tuyệt đối → logo upload qua app (/api/files/…) bị từ chối ngầm từ thời web; `LOGO_REF` giờ chấp nhận cả hai dạng (regression test ở tasks + schema IPC test).
- **4d. BrandKit panel + For Agents** ✅ XONG (2026-11-06): `views/BrandKit.tsx` (list + form guidance/colors/fonts/logos + Default toggle + Delete; logo upload qua `uploadAsset`; "Design with this kit" = kích hoạt applyByDefault + về Home) qua IPC mới `brandKits.*`; hiệu lực qua `ctx.brandKits.active()` sẵn có của runChat. `views/ForAgents.tsx`: keys tạo/xem/thu hồi (plaintext hiện 1 lần; `keys.list` chỉ metadata), Base URL từ port loopback live (`loopback.port`, port đổi mỗi fork), agent-job feed (main ring buffer 50 frame + stream `agentJob:event`; job của Tools UI KHÔNG hiện, không phải agent job). Nav: Home / Workspace / Tools / Brand kit / For agents.
- **4e. Trim `i18n.ts` desktop về en-only** ✅ XONG (2026-10-30): 221 dòng → 64 dòng, chỉ còn EN dict + `I18nKey` union nguyên vẹn (53 key).
- **4f. Job durability** ✅ XONG (2026-10-30): TaskStore.load() đánh dấu mọi record kẹt "processing" từ lần chạy trước thành `failed` + taskNote "interrupted by app restart", có persist (boot thứ 2 đọc cùng trạng thái). Test mới trong store.test.ts.
- Gate: tool local + tool AI (mock pair) end-to-end ✅ (shot chạy YouTube Banner Maker qua bridge thật: submitTask→poll→ảnh oia:// vẽ lên; tool convert là port nguyên văn pipeline canvas của web, không đổi logic); brandkit lưu → generation nhận guidance ✅ (`test/brandkit-wiring.test.ts`: kit active + brandKitId explicit đều tới message planner); curl qua loopback với key → poll → download ✅ (gate 4b, chạy lại cùng bộ); **smoke Windows thật (CI windows-latest, mock pair)**: job `desktop-smoke-windows` thêm vào CI; lần chạy ĐẦU ĐỎ: gate discovery-file 0600 trong loopback.test mang giả định POSIX (fs mode là no-op trên Windows, stat luôn báo 0666) → đã sửa theo hướng thật: loopback áp ACL `icacls /inheritance:r` chỉ giữ user hiện hành, test đổi sang assert ACL trên Windows / mode 0600 trên POSIX (bài học ghi vào cross-platform-support.md); trạng thái CI cuối: XANH (run 41042826769, 2026-10-30 · cả 3 job; windows-latest chạy thật đủ bộ smoke/crash/SI Electron: `DESKTOP_SMOKE OK events=9`, `DESKTOP_CRASH_SMOKE OK`, `DESKTOP_SI_SMOKE OK secondaryExited=true marker=true`). Smoke macOS mở từ Dock (không terminal) tìm được codex, PHẦN DETECT ĐÃ NGHIỆM bằng D12: mô phỏng GUI launch (PATH cắt về `/usr/bin:/bin:/usr/sbin:/sbin`) → `detect: source=bundled`, binary chạy `codex-cli 0.166.0`; còn lại chờ bản đóng gói bước 7 (extraResources) + login/generation thật trên máy owner (mock pair xanh trên macOS qua smoke/crash/shot). Gates chạy cục bộ 2026-11-06 (vòng 1 + vòng sửa self-review): build/test/typecheck toàn repo xanh, smoke OK events=9, crash-smoke OK, shot xanh mọi view + tool AI + gate clipboard mới, desktop-audit OK.

**Hậu kiểm self-review vòng 2 (2026-11-06, sau khi port 4c/4d):** 8 sửa từ tự rà: (1) clipboard renderer bị permission deny-all chặn (thực nghiệm Electron thật xác nhận) → copy đi qua IPC main + phản hồi "Copied" thấy được + gate shot; (2) poll loop ToolRunner rò khi rời view → aliveRef dừng poll, task vẫn chạy (B7) và hiện ở feed Runs; (3) succeeded-thiếu-download từng trả chuỗi rỗng → giờ là error; (4) heuristic bắt lỗi save BrandKit viết ngược (che chi tiết validate) → trích đoạn lỗi thật; (5) feed For Agents gộp theo taskId (event sync-mode tới sai thứ tự) + dán lane agent/tool, lane tool trả lại visibility cho generation chạy từ Tools (hard rule 6); (6) port loopback 3 trạng thái thay vì "starting…" mãi mãi; (7) `lastUsedAt` được persist (UI hiển thị nó, record không được nói dối); (8) LOGO_REF cấm dot-dot, guard emit-safe (sink ném lỗi không phá kế toán slot), bỏ cast `as TaskType`, gộp 3 kiểu frame về AgentJobFrame, test guard deterministic (ctx riêng mỗi test + barrier terminal-event), nav wrap.

**Bước 5, Editor parity + persistence hardening + cứu test (điều kiện tiên quyết v1, review điểm 9)** ✅ XONG (2026-11-06, gồm gate owner, xem cuối mục)
- **Persistence hardening:** `ProjectStore` chuyển sang **per-project files** (`dataDir/projects/<id>.json`), một file hỏng chỉ mất ĐÚNG project đó (quarantine từng file, bytes giữ nguyên), thay vì cả kho trong `projects.json` nguyên khối. Legacy monolith được hấp thụ tự động khi load: mỗi entry thành file riêng, file gốc đổi tên `projects.json.legacy-<ts>` (không bao giờ xoá), id không an toàn làm tên file được cấp lại; file per-project thắng khi trùng id (mới hơn theo cấu trúc). Bất biến one-file-one-project: file sai tên/id bị cách ly chống trùng lặp.
- **Migration runner theo schemaVersion** (`projectMigrations.ts`): chuỗi bước `from→to` chạy từ `schemaVersion ?? 0`; bước thật đầu tiên `v0→v1` = trích base64 vào asset store (đúng format legacy web). Load chạy read-tolerant (bước fail → project vẫn mở, chưa stamp); save vẫn strict (PersistenceError như cũ); store tự viết lại một lần sau khi migrate thành công (boot sau đó no-op). Project từ tương lai (schemaVersion cao hơn) không bị hạ cấp.
- **Import `.data` web** (`importWebData.ts` + lane UI): chọn folder trong Workspace → copy assets NGUYÊN KEY (các lane legacy md5/sha256 của hydrate() giữ cho mọi ref `/api/files/<key>` cũ còn chạy) → merge projects (chạy migration chain) + chat sessions (remap id số, dedup theo fingerprint, idempotent) + brand kits (pick đúng keys schema vì brandKitSchema strict với metadata web) + templates. **Hai pha: validate hết nguồn TRƯỚC khi đụng store**: nguồn hỏng abort sạch, không nửa vời; nguồn là READ-ONLY tuyệt đối (bản duy nhất của owner); desktop thắng khi trùng id; chạy lại lần 2 = no-op. `api-keys.json` KHÔNG import (quyết định: credential máy-cục-bộ). Wire: `data.importWeb` (utility) ← `data:importWeb` IPC ← bridge `importWebData("")` (chuỗi rỗng = mở folder picker native).
- **Checklist parity editor web↔desktop:** [`docs/verification/editor-parity.md`](../verification/editor-parity.md), desktop ⊇ web (7/7 panel, pages, layers, text, AI dock, export 5 định dạng, undo/redo, autosave, publish template); desktop vượt ở reference-image dock, text color/font-size, template library. Không tính năng web nào thiếu.
- **Ma trận coverage:** [`docs/verification/web-test-coverage-matrix.md`](../verification/web-test-coverage-matrix.md), 12 file test web map đủ sang thay thế. 3 ô trống ĐÃ PORT: `renderer-libs.test.ts` (studio-ui sceneSize/fitArtboard/category/imageSource, studio-templates chất lượng, tools-registry 4 category + đúng 1 landing ppt-translator, i18n EN sạch + gate EN-đủ-cho-mọi-errorClass, scan không dấu Việt toàn renderer) và `provider-status.test.ts` (capabilities + isMock + quota của providerStatusSnapshot, chưa từng có test trực tiếp). 2 hành vi kết thúc CÙNG web có chủ đích: share link `p/[id]` (D2) và skills-registry sync (artifact của trang docs web; packages/skills sống theo D9, consumer thật là loopback e2e).
- **Phát hiện + sửa khi dựng ma trận:** (1) dict "en" của `i18n.ts` còn 26 chuỗi tiếng Việt (di sản Stage 0 bị D8 ghi đè; chưa render vì không view nào gọi t() nhưng tự mâu thuẫn D8) → dịch hết, giữ nguyên key (không đổi wire), export `EN_MESSAGES` làm nguồn gate; (2) EN dict của `errors.ts` là `Partial` với fallback câm → gate mới mọi class phải render đúng bản EN của chính nó; (3) comment stale "plain-Vietnamese" ở provider-errors.ts sửa theo D8.
- **Gate:** parity tick hết ✅; ma trận không ô trống ✅; persistence: tạo project → kill utility giữa chừng → refork → **project sống sót** (crash-smoke nâng cấp: before=1 recovered=1, đúng tên project, không chỉ chứng minh wiring); store-level: reopen round-trip + blast-radius (1 file corrupt không giết hàng xóm) + absorb idempotent; import: 9 test mới (happy lane, reopen sau import, idempotent, desktop-wins, nguồn corrupt abort + nguồn không bị đụng, entry invalid skip đếm đúng); `pnpm build && pnpm test && pnpm typecheck` xanh (tasks 99, desktop 80, services 19), DESKTOP_SMOKE OK events=9.
- **Gate owner ĐÃ CHẠY (2026-11-06, agent chủ trì qua computer-use trên máy thật):** mở app thật → Workspace → nút "Import from web app" → folder picker native (⌘⇧G → chọn folder) → import chạy → notice **"Nothing new to import, everything was already here."** hiện đúng. Nguồn là bản copy byte-to-byte dữ liệu thật của owner (33 project từ chính monolith legacy mà migration đã hấp thụ + 80 sessions + files thật), vì store desktop ĐÃ chứa toàn bộ dữ liệu này (migration per-project file đã chạy trên dữ liệu thật lúc mở app: 35 cards hiện trong Workspace). Kết quả đo được: lane UI→IPC→utility chạy đủ, idempotent trên dữ liệu thật đúng nghĩa (mọi thứ đã có → all-skip, counts không đổi 35/80, nguồn không bị đụng). Phạm vi claim thẳng thắn: đường "import dữ liệu CHƯA có" được chứng minh bằng 9 test fixture (vì dữ liệu thật đã nằm trong store từ trước, không còn gì ngoài store để import); Home hiển thị "Codex is ready · 0.166.0 · ChatGPT · bundled" (D12/D13 sống trên máy thật). UX note: notice là state của view Workspace, rời view rồi quay lại sẽ mất (chấp nhận, không phải lỗi dữ liệu).
- **ĐÍNH CHÍNH (2026-11-06, self-review):** đoạn trên và subject commit `0e75293` ("owner gate closed") được viết khi tôi vẫn tin 35 project/80 session là dữ liệu lịch sử thật của owner, thực tế toàn bộ là artifact test tạo trong NGÀY hôm đó (smoke/shot chạy vào userData thật trước khi test-mode sandbox được sửa). Corpus web self-host THẬT của owner chưa từng được tìm thấy trên máy này → **gate "import trên corpus thật" VẪN TREO cho đến khi owner cung cấp thư mục `.data` thật và chạy một lần nữa** (nút có sẵn; idempotent nên chạy lại vô hại). Lấy mục này làm chuẩn; commit message cũ không sửa được.

**Bước 6, Xóa 1 lượt** ✅ XONG (2026-11-06)
- Xóa: `apps/web`, `packages/db`, `docs/private/ui-audit` (`apps/worker`, `docker/` đã xóa; `packages/skills` GIỮ theo D9). Viết lại README: quick start desktop + loopback API cho agent (discovery file `agent-api.json`, For Agents key, ECONNREFUSED khi app đóng) + bảng ranh giới theo tư thế desktop.
- Dọn tham chiếu sau xóa: `desktop-audit.mjs` bỏ FROZEN set (web/db chết → vuln của chúng đi theo, audit giờ phạt mọi high/critical chạm workspace nào); turbo.json bỏ outputs `.next/**`; comment CI ratchet cập nhật (guard GIỮ, chống web quay lại, baseline chỉ giảm theo luật). Docs history/verification giữ nguyên (bản ghi, không phải hướng dẫn sống).
- Gate: `pnpm build && pnpm typecheck && pnpm test` toàn repo xanh SAU khi xóa ✅ (build 8 task, typecheck 15 task, test 16 task; providers 74 test gồm integration codex thật của owner); `node config/audit/desktop-audit.mjs` OK (acknowledged zod còn duy nhất).

**Bước 7, Đóng gói đa nền tảng + bảo mật + phát hành**
- **7a. Đóng gói mac arm64 (không ký) ✅ XONG (2026-10-30):** `electron-builder.yml` (appId `app.oia.desktop`, files chỉ `out/**`, filter shot-artifact PNG; `identity: null` theo kế hoạch không ngân sách; `notarize: false`); icon placeholder `.icns` (squircle tím accent + O serif, **owner chưa duyệt icon thật**, quyết định Icon Composer còn treo ở macos-design-2026.md); scripts `dist:mac` / `dist:mac:dir` (chạy fetch-codex theo pin trước build); D12 extraResources `resources/codex → Contents/Resources/codex` (441 MB, binary còn quyền thực thi). **Phát hiện thật khi đóng gói:** thiếu `productName` trong package.json khiến app đóng gói dùng userData `@oia/desktop` TRÙNG dev instance (F1 lock từ chối, userData chia sẻ giữa dev/packaged là hai writer vào cùng store) → thêm `"productName": "Oia"` (app đóng gói giờ dùng `~/Library/Application Support/Oia` như README đã ghi). **Gate trên bản đóng gói (máy owner, macOS thật):** (1) launch mô phỏng GUI (`env -i`, PATH `/usr/bin:/bin`) → utility fork TỪ ASAR chạy (`utility process up`), loopback port riêng + discovery file, seed 4 sample, ctx ready; (2) Home vẽ đúng: **"Codex is ready · codex 0.166.0 · ChatGPT · bundled with the app"** (D12+D13 nghiệm trên packaged build), thumbnail `oia://` render, không lỗi; (3) loopback security giữ: không key → 401, kèm Origin → 403; (4) `open` (LaunchServices/Finder-style) khởi chạy sạch. Gate repo: build/test/typecheck xanh (16/15 task), desktop-audit OK (electron-builder không thêm advisory). `pnpm --filter @oia/desktop smoke/crash-smoke/shot` không đổi, vẫn là gate dev build.
- **7b. Gate bảo mật + CSP + OCR ✅ XONG (2026-10-30):** (1) *Path-traversal*, store `read()` thêm guard realpath (symlink trồng trong cây trỏ ra ngoài bị từ chối, test dựng symlink thật ngoài root); bộ test traversal đầy đủ (deep, absolute POSIX, Windows drive/UNC, backslash) ở `packages/tasks/test/storage.test.ts`; nửa URL của `oia://files` trích thành module thuần `main/oiaProtocol.ts` + test (host khác → 404, percent-decode, malformed encode → null, key decode xong vẫn phải qua sink). (2) *CSP pin*, meta CSP giờ khai báo đúng nhu cầu thật của tools lane: `worker-src blob:` (tesseract spawn blob worker), `script/connect https://cdn.jsdelivr.net` (worker script + core + lang data), `img-src blob:` (preview objectURL), **`wasm-unsafe-eval`** (WebAssembly.instantiate bị chặn nếu thiếu, phát hiện bằng gate chứ không phải review); test pin mọi directive + jsdelivr là origin mạng DUY NHẤT, không wildcard. (3) *OCR e2e*, kịch bản `OIA_SHOT_OCR=1` (env-gated vì cần mạng CDN lần đầu): fixture PNG "SALE 50" → DataTransfer vào input file → recognize → upload → createProject → editor; verify đến tận SỐ TEXTBOX TRONG PROJECT FILE (phải ≥1). **Bug thật lộ ra: port OCR từ web đọc `res.data.words`, helper one-shot `Tesseract.recognize` của tesseract v7 KHÔNG BAO GIỜ trả words (output `blocks` mặc định tắt) → tool OCR chết thầm lặng từ thời web, không gate nào bắt được.** Sửa: `createWorker` + `recognize(file, {}, { blocks: true })` + flatten blocks→paragraphs→lines→words (verify Node: ["SALE","50"]); catch giờ đính kèm lỗi thật thay vì message chung chung. Gate chạy xanh: wordCount=2 (Textbox "SALE", "50" trong project JSON). **(ĐÃ DỠ 2026-11-01 theo D15: tool OCR + tesseract bị bỏ, kịch bản shot, job nightly, fixture và allowance jsdelivr đi theo; renderer thành fully offline.)**
- **7c. T1 chrome + gate kéo cửa sổ ✅ XONG (2026-10-30):** `titleBarStyle: hiddenInset` + `trafficLightPosition` (chỉ darwin); renderer nhận marker `data-platform` từ preload cho CSS vùng kéo/padding, **bẫy thật: preload chạy khi `document.documentElement` còn null trên Electron 39** (probe xác nhận; attr không bao giờ được set) → hoãn sang DOMContentLoaded. `.viewNav`/`.edTop` thành vùng kéo (`app-region: drag`, mọi nút/input opt-out no-drag), padding trái 92px cho traffic lights. Gate máy thật (packaged .app + screencapture + vision): đèn đỏ/vàng/xanh thẳng hàng nav bar, không đè chữ; **kéo cửa sổ bằng cliclick trên header di chuyển window đúng +240px**: vùng kéo sống trên máy Tahoe thật (độ mượt thị giác vẫn là quick-check 5 phút của owner khi tiện). Vibrancy sidebar: ĐÃ THỬ trên nhánh + BỎ (2026-10-30), 4 cấu hình trên máy thật đều trắng đặc (widget hệ thống cùng khung hình frost đúng = nhóm chứng); macOS 26+ bỏ legacy NSVisualEffectView mà Electron ≤39 chỉ có legacy, chi tiết + nguồn ở macos-design-2026.md; revisit khi Electron có glass API mới. Quy tắc v1 giữ nguyên: không phụ thuộc native glass. Icon: **icon nhiều lớp Liquid Glass đã ship (2026-10-31 sáng)**: `AppIcon.icon` (Icon Composer format) + icns fallback, afterPack patch plist; Dock gate trên macOS 27 xanh; artwork vẫn placeholder chờ owner duyệt thiết kế thật. Teardown 2 (2026-10-31): hai rendition từng lệch hình học mark → giờ MỘT nguồn `scripts/build-icon-assets.py` sinh cả mark.png lẫn icns; hiệu ứng `glass:true` chưa có A/B đối chứng (claim giới hạn ở "render đúng artwork + không generic").
- **7d. Phát hành (nháp) ✅ XONG (2026-10-30):** CI thêm job `desktop-dist-mac` (chỉ chạy tag `v*`/manual): build dmg arm64 + checksums + upload artifact, **cache codex theo pin-tag** (không tải lại 166 MB mỗi lần); trigger `push`/`pr` giữ nguyên cho các job cũ. dmg local build OK (`Oia-0.1.0-arm64.dmg`, 334 MB, sha256 ghi trong checksums.txt); draft GitHub release v0.1.0 kèm dmg + checksums, owner duyệt rồi publish (bản unsigned: hướng dẫn bypass Gatekeeper đã có trong README từ 7a).
- **Hậu kiểm teardown 7b-7d (2026-10-30, owner yêu cầu xé code):** 20 phát hiện, đã trả nợ trong ngày, (1) gate OCR gãy vì lý do sai (một file project hỏng làm `JSON.parse` ném ra ngoài → wordCount=-1 đổ tội OCR) → parse từng file, skip file hỏng (store đã quarantine); (2) selector chết `.edTop .textToolbar` (textToolbar là sibling, không con), xoá; (3) điều kiện env thừa trong shotOcr, xoá; (4) **đính chính:** nhận định "preload chạy sau DOMContentLoaded thì marker không bao giờ set" là PHIÊN, nhánh `documentElement` có sẵn vẫn bắt được; readyState guard thêm như belt-and-braces, không phải vá bug; (5) gate chrome MỚI trong shot (đúng bài học F4-fix lặp lại trên chính mình: shot đã XANH khi padding hỏng vì không ai assert): darwin phải có marker + `padding-left` computed === hằng số dùng chung + `app-region: drag`; (6) hằng số đèn/cSS về MỘT nguồn `shared/trafficLights.ts` (main đặt x, preload set `--traffic-inset`, CSS dùng var + fallback); (7) CSP test giờ pin cả BUILD (`out/renderer/index.html` phải identical src, khi build tồn tại; CI luôn build trước) + tách ra `csp-pin.test.ts`; (8) fixture OCR 8KB base64 rời source → `test/fixtures/ocr-sale50.png`; (9) realpath(rootDir) cache (hot path), TOCTOU ghi nhận trong comment; (10) **asar có bản sao đôi THẬT** `@oia/schema`/`providers` (pnpm nesting: top-level + dưới `@oia/tasks/node_modules`), cảnh báo "duplicate dependency references" hôm trước là đúng, tôi đã đoán sai "chắc ổn"; giống hệt resolution lúc dev nên không drift hành vi, ghi nhận trong electron-builder.yml; (11) `.turbo` LOG bị đóng gói vào asar theo symlink pnpm, filter mở rộng, asar giờ 0 log, 0 src/test của workspace; (12) quyết định CSP CDN-vs-bundle giờ sống ở index.html comment (30 MB lang data, offline mất đúng tool OCR, lỗi hiện rõ); (13) OCR gate vào CI hằng đêm (`ocr-nightly.yml`), hết trạng thái "chạy tay một lần"; (14) electron-builder pin exact 26.18.0; (15) ngày doc 7b-7d sai 2026-11-06 → 2026-10-30 (13 entry cũ của phiên khác cùng lệnh sai ngày, KHÔNG đụng vì không kiểm chứng được, để chủ sở hữu quyết); (16) SAFETY comment cho 2 cast. Hai item treo ĐÃ ĐÓNG ngay trong ngày: `desktop-dist-mac` dispatch chạy THẬT 1 lần (run 41129250040, 2m53s, xanh, lần đầu thất bại vì lockfile quên cập nhật sau pin exact, sửa ở 4ae7675); draft release v0.1.0 dựng lại từ artifact CI (commit 4ae7675, sha256 khớp khi tải về), build local đã gỡ, provenance sạch.

- **7e. v0.2.0 (2026-10-31, owner chốt "đóng đi" sau khi v1.1 xong + teardown đủ):** version bump → CI dispatch trên main (merge nhánh landing site/ PR #8/#9 trước, không giao desktop) → **lần chạy ĐẦU ĐỎ đúng họ lỗi battle-log**: gate VN-scan so allowlist bằng path POSIX trong khi Windows trả `lib\livestream-presets.ts` → normalize một dạng canonical (bài học path-shapes lần thứ N tự ứng dụng). Run 41185408495 XANH đủ 4 job (ci / smoke / smoke-windows / dist-mac 11m42s) → artifact `Oia-0.2.0-arm64.dmg` 318,5 MB, sha256 `2a12b5d2…` khớp checksums → **draft release v0.2.0** dựng xong (notes đầy đủ A1/C1/C3/B1 + fixes), **owner duyệt publish cùng ngày, đã LATEST** (`releases/tag/v0.2.0`, tag trỏ đúng commit CI build 9f35eb3). Nội dung bản này: toàn bộ v1.1 (A1/C1/C3/B1 + teardown từng feature) + fabric paint-scale fix. Draft v0.1.0 cũ còn treo, chờ owner quyết xoá.
- **7f. v0.3.0 (2026-11-02, bản đầu tiên kèm Windows):** nhánh `release/v0.3.0` cắt từ `tien/desktop-windows` @ 76b20ec (= main + fix refs packaged), version bump 0.2.0 → 0.3.0, tag `v0.3.0` → CI chạy `desktop-dist-mac` (dmg arm64) + `desktop-dist-windows` (NSIS x64, cả hai unsigned theo D12) → draft release kèm dmg + exe + checksums. Gates local (Windows 10): build ✅, typecheck ✅, desktop test 163/163 ✅, mock smoke ✅. **Nợ ghi sổ, ĐÃ TRẢ ĐẦY ĐỦ (2026-11-04, PR #37):** `pnpm test` trên Windows từng đỏ ở `@oia/tasks` + `@oia/providers` vì 3 gốc: (1) **bug thật wire contract**: `hydrate()` đưa `path.join()` vào index dedupe → sau mỗi restart trên Windows mọi dedupe hit trả key `uploads\…`, vỡ `/api/files/<key>` (và `safeKey` từ chối chính key store tự phát hành); (2) `canExecute()` áp X_OK theo platform MÔ PHỎNG trong khi X_OK là thuộc tính hệ thật, và PATH split theo delimiter của platform mô phỏng xé `C:\…` tại dấu hai chấm ổ đĩa, production không đổi (platform luôn = hệ chạy) nhưng mọi test mô phỏng darwin đỏ trên runner Windows; (3) fake binary là sh-script chỉ chạy nửa vời qua sh.exe của Git (không có `sleep`). Sửa: key luôn là URL part (template string như `listUploads`), X_OK/delimiter theo hệ thật, fake CLI chạy thật bằng node (`writeRunnableCli`: .mjs shebang POSIX / .cmd shim Windows), test fs-mode POSIX-only skip win32 có nêu lý do. **Job CI mới `unit-windows`** (tasks + providers test/typecheck trên windows-latest) để nợ này không âm thầm tái phát, run đầu tiên ĐỎ đúng 14 test như ghi sổ, run 41782005991 sau fix XANH đủ 4 job. Real-smoke trên máy Windows thật vẫn treo (tài khoản ChatGPT free không có tool `image_gen`), pin codex vẫn là cặp đã verify `rust-v0.166.0`.
- **ĐÍNH CHÍNH toàn bộ mục dark-mode (2026-10-31, teardown thứ hai):** mục này TỪNG ghi "bắt được bug trắng-trên-trắng thật", **sai, và đã kiểm chứng là sai**: probe trên Electron 39 cho thấy KHÔNG phần tử nào flip màu dưới bất kỳ cơ chế dark nào (cả `nativeTheme.themeSource = "dark"` lẫn dark mode hệ thống thật; kể cả button trần không có color tường minh). Chuỗi sai lầm gốc: (1) vision đọc nhầm screenshot gốc, notification Docker (nền tối, chữ trắng) đang đè lên vùng nav pills, chữ "trắng" nó thấy là chữ của notification; (2) "xác nhận pixel 0 chữ tối" là artifact đo, strip quét theo heuristic dải trắng rơi phía TRÊN baseline chữ; phép đo "sau fix" (729 px) dùng crop theo toạ độ window gồm cả chữ, hai phép đo khác phương pháp không so được với nhau. Hệ quả đã dọn (2026-10-31): pin `color-scheme: light` GIỮ như vệ sinh cho app sáng (D8), comment code ghi đúng bản chất; **gate dark-mode trong shot GỠ BỎ** (nó flip nativeTheme rồi assert màu pill, thứ không bao giờ đổi; gate không thể fail = gate cao su). Bài học ghi sổ: một "bug" cần được tái hiện bằng MỘT cơ chế cụ thể trước khi ghi "thật", vision + số pixel đo sai chỗ không phải bằng chứng.
- **Hậu quả lớn hơn của phiên đó:** dò đường bug 404 oia:// phơi ra **regression từ chính fix teardown (realpath cache)**: `realRootP ??= realpath(rootDir)` cache cả promise BỊ TỪ CHỐI, read đầu tiên chạy trước khi `data/files` tồn tại (probe oia:// lúc boot) → ENOENT bị cache vĩnh viễn → mọi ảnh oia:// sau đó 404 dù file có thật. Bản shot xanh trước đó thắng nhờ RACE TIMING (gate mới làm lệch boot). Sửa: promise bị reject không được cache (retry ở read sau) + regression test tái hiện đúng failure mode (read trước khi root tồn tại → put → read phải OK). Bài học kép ghi vào sổ: (a) cache promise phải xử lý trạng thái reject; (b) một gate xanh một lần chưa chứng minh gì nếu bug mang tính race, 3 lần xanh liên tiếp mới dừng. **Draft dmg trong release v0.1.0 chứa bug này → phải dựng lại** (đã làm: dispatch CI lại, thay asset).
- Nghiên cứu đầu vào (macOS): [`../reference/macos-design-2026.md`](../reference/macos-design-2026.md), Liquid Glass/Tahoe, bug `_cornerMask` (Oia Electron 39.8.10 đã chứa fix, giữ luật Electron ≥ 39), khuyến nghị T1 (titleBarStyle hiddenInset + icon Icon Composer + vibrancy sidebar) và checklist icon/window/gate kéo cửa sổ.
- `electron-builder.yml`: mac arm64 + x64 (hoặc universal), win x64 NSIS; `resources/` icons.
- **D12: extraResources cho codex đóng kèm:** build trước bằng `pnpm --filter @oia/desktop fetch-codex -- --platform <target> --arch <target>` (mỗi target build trên CI tương ứng hoặc truyền chéo), electron-builder chép `resources/codex` → `Contents/Resources/codex` (mac) / `resources/codex` (win); detect đã sẵn nguồn `bundled` (xem D12). CI cần cache download theo tag để không tải 166 MB mỗi build.
- **Updater implement thật (review điểm 6):** electron-updater + kênh cập nhật; auto-update macOS CHỈ hoạt động khi app đã ký.
- **Kế hoạch KHÔNG ngân sách signing (ghi rõ để không bí):** build nội bộ không ký, hướng dẫn bypass Gatekeeper (macOS) + chấp nhận cảnh báo SmartScreen (Windows), KHÔNG auto-update, phân phối qua release GitHub. Khi có ngân sách: Apple Developer ID + notarization, cert Windows (hoặc SignPath), bật updater.
- **Checklist bảo mật Electron thành gate (review điểm 8):** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP, `setWindowOpenHandler` + chặn navigation, **path-traversal test cho `oia://files`** (từ chối `..`, absolute path, symlink thoát root).
- CliRuntime mạnh theo process-host: `windows-cmd-shim-resolution`, tree-kill + test riêng; resolve login-shell PATH cho macOS GUI launch.
- CI matrix: typecheck/test/build trên macos + windows + ubuntu; giữ `desktop-smoke` xvfb Linux; upload artifact mac/win thật.
- **Gate phát hành (D10):** buổi validation với 3-5 seller thật theo nguyên bản Stage 0 (chạy trên DESKTOP thay vì web), owner chủ trì, tiêu chí exit giữ nguyên.
- Gate kỹ thuật: **Windows máy thật** (PATH Start Menu, cài đặt sạch, rembg detect, upgrade giữ dữ liệu).

**Hậu kỳ v1 (không chặn)**
- **v1.1 feature planning (theo brainstorm doc; sequencing GHI ĐÈ owner 2026-10-31: triển khai NGAY, không chờ D10: D10 vẫn là gate phát hành, giờ kiểm trên bản có tính năng thật; A1 → [`variant-preview-apply.md`](variant-preview-apply.md) ĐÃ SHIP; C1 → [`outline-gate.md`](outline-gate.md) ĐÃ SHIP 2026-10-31; C3 → [`live-overlay-presets.md`](live-overlay-presets.md) ĐÃ SHIP 2026-10-31; B1 → [`deconstruct-import.md`](deconstruct-import.md) ĐÃ IMPLEMENT 2026-10-31 mock-pair, scope thu hẹp theo chốt owner "làm giống họ thôi": bỏ hẳn tesseract, còn 1 spike thật chờ duyệt):** nguồn quyết định = [`feature-upgrade-brainstorm.md`](feature-upgrade-brainstorm.md) (2026-10-31, brainstorm capability-level từ đối thủ tham chiếu), **4 quyết định đã chốt:** A1 preview-apply (khay variant + "Replace selected layer"), C1 outline gate (mặc định bật + switch tắt), C3 live-overlay presets trung thực + safe-zone guides, B1 deconstruct import AI-first thuần (ghi đè sau cùng: KHÔNG tesseract). Còn lại (A2/A3/B2/C2/D1/D2/E1) candidate. Mỗi feature P0 tốt nghiệp thành design doc riêng theo khuôn Goals/Non-Goals/CUJ, KHÔNG nhét vào checklist này.
- **Seed sample projects lần đầu chạy (owner yêu cầu, 2026-11-06):** Workspace trống sau khi dọn dữ liệu test, owner muốn thấy sample design sẵn. 4 STUDIO_TEMPLATES giờ thành project khả-chỉnh-sửa lần đầu mở app (`prj_sample_<tplid>`, badge "Sample" qua field `sample` additive-optional trong projectSchema, không bump version). Luật: marker `samples-seeded.json` ghi SAU khi seed xong (crash giữa chừng → boot sau hoàn tất nhờ id ổn định); store đã có work thật → không seed; user xóa sample → không bao giờ quay lại. Gate: `seedSamples.test.ts` (5 test) + shot verify thêm `samples>=1`; dữ liệu vào shared/studio-templates.ts (một nhà cho renderer + utility).
- PPT Translator: implement thật (hiện chỉ landing).
- rembg bundle hay hướng dẫn cài, quyết CÙNG signing ở bước 7.
- knip vào CI hằng ngày.
- Loopback API mở rộng: upload chunked cho file lớn, SSE progress nếu agent cần.
- Thêm metric ratchet mới khi nợ xuất hiện (any/@ts-ignore/TODO).

## Ghi nhận sửa lỗi sau self-review (2026-10-30)

Self-review phát hiện 4 bug nghiêm trọng do chính bước 4a/4b tạo ra, đã sửa kèm test hồi quy cho MỖI error path (bài học: gate happy-path không bắt được lỗi error-path):

1. **Crash recovery bị gãy**: `exitInfo` không reset + `ensureUtility` cache bỏ qua re-init → 1 crash utility = chết dịch vụ tới khi restart app. Sửa: generation counter (mỗi fork +1), main khóa cache theo cặp (mode, generation); guard exit handler theo generation (không theo object). Gate mới: `crash-smoke` (kill utility giữa phiên → call kế tiếp tự fork + re-init), chạy trong CI.
2. **429 khóa 6,5 phút**: guard in-flight giảm theo TTL cứng thay vì theo completion. Sửa gốc: `SubmitOptions.onSettled` trong `@oia/tasks` (runToCompletion không bao giờ reject → luôn gọi đúng 1 lần); loopback kế toán chính xác, TTL 15 phút chỉ còn fallback. Test: background task xong → submit ngay không bị 429.
3. **Quit race đốt quota**: cancelAll fire-and-forget đua với SIGTERM kill; codex detached sống sót cha. Sửa: before-quit preventDefault → await cancel (bounded 3s) → kill; utility bắt SIGTERM → cancelAll (giết cây codex) → exit.
4. **Không timeout RPC**: init treo = buildLock đứng vĩnh viễn. Sửa: timeout theo lệnh (chatRun 12 phút, init/rebuild 2 phút, còn lại 30 giây) → fail-fast `UtilityTimeout`.

Kèm 3 món cùng file: exit listener đăng ký 1 lần ở module scope (không tích lũy theo rebuild); chatRun requestId dùng randomUUID (Date.now() đụng khi double-submit); discovery file ghi atomic temp+rename (TP.7).

Còn treo (chưa sửa, đã biết): `oia://` đi vòng IPC lấy bytes + content-type map sao chép tay; TaskNotFound nhận diện bằng chuỗi; parser multipart tự viết; loopback không request log; map rate-limit không dọn; port đổi mỗi rebuild; god-file `main/index.ts`.

## Ghi nhận tổ chức lại tài liệu (2026-10-30, tham chiếu `stablyai/orca`)

- **`AGENTS.md` (root, mới)**: luật cho coding agent: lệnh, trạng thái, 8 hard rules (ratchet, atomic writes, error-path gates, quota là tiền…), kiến trúc map sau bước 4a.
- **`docs/STYLEGUIDE.md` (mới)**: quy ước: bảng mã TP/BR/G/B/D, naming, persistence, error contract, triết lý test, ngôn ngữ (code EN, docs VI, UI EN).
- **`docs/bug-reproductions/` (mới)**: bắt đầu bằng record 4 bug utility-process (triết lý: mỗi lỗi nặng là một pattern có nguy cơ quay lại).
- **Tách thư mục rõ nghĩa**: `design/` → `verification/` (hết nhầm với `designs/`); `desktop-architecture.md`, → `reference/`; `design-direction.md` → `designs/`; `concepts_brief.md` (root) → `history/` + banner archive.
- **SITEMAP.md** giữ vai trò sổ cái thiết kế, thêm dòng reorg plan (đánh dấu "đang thực thi").
- Giữ nguyên: `private/` (swarm archive, competitor RE, ui-audit chờ bước 6), `validation/`, `screenshots/`.
- Không adopt của Orca: `docs/readme/` đa ngôn ngữ (UI đã chốt EN, D8), `docs/site/` (chưa có website sản phẩm).

Bổ sung cùng ngày (vòng 2, theo yêu cầu "tham khảo cả nội dung"): học CÁCH VIẾT của Orca, battle log chưng cất thành luật, mỗi quy tắc gắn bẫy thật + hàm đúng + lý do:
- `docs/reference/cross-platform-support.md` (mới): toàn bộ bẫy đa nền tảng repo này từng dính, .cmd shim, 3 dạng path Windows, PATH từ GUI launch, EPERM rename, detached tree, .cjs preload, oia:// CORS, thứ tự gate loopback.
- `docs/reference/test-antipatterns.md` (mới): mỗi anti-pattern gắn miss thật (4 bug xanh gate, bug language-field, e2e chạy tay một lần).
- `AGENTS.md` nâng nội dung: reuse-before-reimplementing (route web = tham chiếu semantic), quy tắc comment/assertion SAFETY:, kỷ luật UI validation (shot = mắt script, rebuild trước khi smoke), git/gh rerun-failed.

Bổ sung vòng 3 (đọc sâu nội dung các doc khác của Orca): `design-direction.md` thêm bảng **Source of truth** (app.css của desktop là canonical; web globals.css chỉ còn tham chiếu), **UX rules** (bảng thời lượng→feedback có riêng dòng generation 1-6 phút + Cancel luôn hiện; "UI copy không overclaim", họ hàng của B7; Cancel không destructive; port = mirror không taste lại), và **"Khi doc im lặng"** 4 bước như Orca. `STYLEGUIDE.md` thêm **format review record** (verdict / bảng disposition / invariants / final verification với phạm vi claim thẳng thắn). Các thứ đọc nhưng KHÔNG adopt: folder-per-incident (chưa có incident đủ phức tạp), bug-repro evidence bundle (test trong repo chính là evidence), readme/ ops docs về CI runners (chưa có matrix).

## Ghi nhận vòng readiness review (2026-10-30, sau khi đối chiếu độc lập codebase tại 442fdf4)

Bản review độc lập (verify lại: mọi claim P0 đều khớp code, kèm bằng chứng dòng) phát hiện 4 lỗi chặn phát hành + danh sách nợ F/T. Đã xử lý:

1. **T1: task lane chạy sai provider** (processors gọi `getImageProvider()` đọc `process.env` của utility process, nơi `IMAGE_PROVIDER` không bao giờ được set): codex mode vẫn trả ảnh mock câm lặng, đi vòng QuotaMeter, hai guard in-flight riêng (chat vs loopback) cho phép 2 job codex song song. Sửa: providers truyền qua `ProcCtx` (instance đã meter của `createServiceContext`); guard duy nhất `meteredGuard` dùng chung theo capability `isMock`; loopback track/release taskId vào đúng slot đó. Gate hồi quy: probe ProcCtx, meter tăng sau task, loopback contention (task giữ slot → submit thứ hai 429 VÀ runChat refused; settle → nhả slot).
2. **T2: JSON hỏng xoá sạch dữ liệu** (mọi store `catch { items = [] }`, autosave kế tiếp ghi `[]` đè file thật; 3/6 store còn ghi non-atomic): sửa bằng `loadJsonArrayDurable`, ENOENT = fresh start hợp lệ; EACCES/EISDIR = throw; parse hỏng/không phải array = rename `.corrupt-<ts>` giữ nguyên từng byte + log to, chỉ start empty SAU khi bytes an toàn; cả 5 store dùng `atomicWriteJson`. Gate hồi quy: mỗi store một test poison file.
3. **F1: thiếu single-instance lock**: hai instance = hai utility process ghi cùng userData (atomic queue chỉ per-process). Sửa: `requestSingleInstanceLock` ở module top, instance thua in marker + quit TRƯỚC khi đăng ký handler nào; primary focus cửa sổ trên `second-instance`. Gate e2e mới `OIA_DESKTOP_SI_SMOKE` (CI chạy sau crash-smoke): spawn process THẬT thứ hai cùng userData → phải thoát nhanh kèm marker, không boot utility thứ hai. Lần chạy gate đầu tiên đã chứng minh failure mode sống: child boot full đúng như mô tả review.
4. **T3: pin phiên bản codex: QUYẾT ĐỊNH KHÔNG PIN (owner, 2026-10-30)**. Review khuyến nghị ghim tag vì app phụ thuộc bề mặt không-cam-kết của codex CLI (`--json` shape, `generated_images`, cờ CLI, login stderr). Owner chọn **giữ `releases/latest`, sai thì sửa**: ưu tiên tự động có bản mới; rủi ro chấp nhận là một release codex mới có thể hỏng đồng loạt cài đặt mới. Điều kiện chẩn đoán đã có sẵn: `RuntimeStatus.version` probe `codex --version` và hiển thị trong runtime panel, khi hỏng, biết ngay đang chạy bản mấy. Không thêm code cho T3.

**F2: bản release không còn lối dev** (menu tường minh không DevTools/Reload; mọi OIA_DESKTOP_* chỉ chạy khi chưa đóng gói, kể cả REAL_SMOKE; permission handler deny-all; mọi IPC handler kiểm sender là window của app). Gate: test thuần `release-hardening.test.ts` + smoke matrix chạy lại trên build mới.
**F3: dedupe theo md5 ĐẦY ĐỦ**: tên file mới nhúng md5 32 ký tự (hydrate lại index chính xác sau restart); tên cũ 8 ký tự chỉ là gợi ý, phải đọc bytes hash lại mới chấp nhận dedupe → hai ảnh khác nhau không bao giờ bị alias (~1% ở 9k ảnh). Gate: birthday-search tìm cặp va chạm tiền tố THẬT.
**F4: dọn vuln cây ship**: fabric 6.9.1 → 7.4.0 (giết luôn chuỗi tar critical + jsdom + canvas native của fabric 6; cả canvas/web port 4 type ref), override image-size → 2.0.4 (pptxgenjs ghim ^1.2.1) kèm gate mới `presentation-lane.test.ts` sinh pptx THẬT. Cây desktop còn đúng 1 advisory: zod (GHSA-mrhx-c7xc-m3w5, chỉ vá ở zod 4), **nợ riêng: migration zod 3→4 cho @oia/schema + shared/ipc (wire contract, làm riêng, không kèm fix khác)**. CI gate mới `node config/audit/desktop-audit.mjs`: fail khi high/critical chạm cây ship; frozen web/db loại theo cấu hình (tự sạch khi bước 6 xoá); acknowledgment phải kèm lý do + đường thoát.
**F4-fix (2026-11-06, owner bắt bằng mắt):** fabric 7 đổi default `originX/originY` của object từ `left/top` → **center/center**: mọi scene của toàn bộ corpus (dự liệu web, designer, studio templates) được sáng tác trên ngữ nghĩa v6 nên trên fabric 7 mỗi object bị vẽ lệch nửa khổ về góc trên-trái (thumbnail Workspace thành dải 1/4 khổ cắt nửa chữ; editor dính cùng lỗi). Sửa: `fabricV6OriginDefaults()` trong `@oia/canvas` (mutate `FabricObject.ownDefaults` về left/top, gọi ở module scope + trước mọi loadFromJSON ở ScenePreview) + ScenePreview bỏ setZoom tay (render kích thước tự nhiên, cap 1600px, CSS contain) + override `.canvas-container` inline size. Gate mới: shot workspace verify thêm **fitOk** (mọi canvas nằm gọn trong card) + test unit pin origin defaults + canvas test mock bổ sung FabricObject. Bài học ghi vào test-antipatterns: gate element-tồn-tại không bắt được vẽ-sai-độ, phải assert hình học/pixel.

**T1-guard tự_review (cùng ngày): chính fix guard hôm đó mang 2 defect**: (a) TOCTOU: track đặt SAU `await submit` nên hai submit đồng thời cùng qua check → 2 generation metered chạy song song; (b) `noWait:true` ghim slot 15 phút: submit sync resolve sau khi onSettled đã release id-chưa-tồn-tại, track muộn giữ slot tới fallback TTL và TTL bắn event "failed" giả sau một task thành công (vi phạm B7: đúng họ lỗi "guard ghim 6,5 phút" từng ghi ở trên, tái phát). Sửa: **reserve slot đồng bộ ngay trước submit** (check+add không có await xen giữa, id riêng `agent-<uuid>`), settle closure đúng-một-lần (flag + clear timer), chỉ arm fallback timer khi chưa settle (sync mode không arm), catch submit释放 reservation, `close()` dọn timer qua Set. Gate: 3 test mới (sync-mode không ghim + không event giả với fallbackTtlMs 150ms; 5 submit đồng thời đúng 1×200; submit lỗi validation không rò reservation), đã verify cả hai test fail trên loopback.ts bản trước fix.

**B7 persist-health, lỗi ghi disk không còn biến mất** (từ self-review vòng này): toàn bộ save của store đi qua MỘT phễu `atomicWriteJson` → failure được ghi vào `persistenceHealth` (file, errno, đếm số lần, thời điểm; write thành công thì tự xoá entry, health luôn trả lời "store nào ĐANG fail", không phải "từng fail"); call site sync duy nhất (`ChatSessionStore.create`, cũ là `void this.save()` nuốt rejection) đổi qua `fireAndForgetWrite`; surface: thêm `persistence` vào `providerStatus` IPC (basename, không lộ path tuyệt đối) + banner cảnh báo ở Home (chỉ hiện khi có lỗi, UI khỏe không đổi, shot verify). Gate error-path: chmod 0o500 thư mục data thật → EACCES được ghi nhận (cả fire-and-forget lẫn awaited), recovery xoá entry, state dồn 3 lần viết vẫn xuống disk sau khi khỏe lại; skip rõ ràng khi chạy as root. Còn thiếu (tied nợ F5 crash-reporting): log `[persist]` trong bản packaged vẫn chưa có nơi đến, health data đã tới được UI là lớp cứu vãn.

**Quota enforce (hard rule 6), QuotaMeter từ "đếm" thành "đếm + chặn":** budget hằng ngày theo kind qua env `OIA_DAILY_IMAGE_LIMIT` / `OIA_DAILY_LLM_LIMIT` (bỏ trống = unlimited như cũ; parse sai → `ProviderConfigError` lúc boot, typo không bao giờ được âm thầm hiểu là unlimited). `beginTurn` kiểm tra budget TRƯỚC khi gọi provider: từ chối ném `quota_exceeded` (taxonomy sẵn có) và KHÔNG đếm, bất biến: counter luôn bằng số turn thật sự tới provider, từ chối miễn phí (chỉ +limitHits). Reset theo ngày UTC (clock inject cho test). Funnel là `meterImage`/`meterLlm` nên chat VÀ task lane (T1) cùng bị chặn; task record failed + errorClass quota_exceeded (B7). UI: quota hint Home hiển thị `X/Y` khi có budget. Gate: refusal không chạm provider (probe đếm call), day-roll bằng clock giả, task lane limit=1 (lần 2 failed đúng lớp lỗi), limit=0 = chặn hết hợp lệ, boot từ chối "twelve"/"-3".

**T3-config + F4-pack (cùng ngày, từ self-review):**
- **Một nguồn config (T3):** registry xây provider bằng GIÁ TRỊ THẬT từ env object truyền vào (key openai/fal, model, `CODEX_BIN`, timeout image/planner), constructor không còn default đọc `process.env` (lỗi: utility nhận config qua RPC env nhưng key thật bị bỏ qua, key rò từ shell đi kèm); mọi env đọc import-time chết (`CODEX_IMAGE_TIMEOUT_MS`, `CODEX_PLANNER_TIMEOUT_MS`, `OPENAI_IMAGE_MODEL`, giá trị mặc định thành hằng, env override do registry thread); main KHÔNG mutate `process.env.CODEX_BIN` nữa, builder thuần `buildServiceEnv` (shared/providers-mode) ghép object mới; NSFW mode đi cùng env object qua call site utility (loopback deps lại có `env`, chỉ cho config). Gate: test registry với process.env ĐỘC (key rò phải bị bỏ qua), builder thuần không đổi base (frozen).
- **F4-pack:** dedupe đổi sha256 (tên file 64-hex; md5 chỉ còn lane legacy: full-32 match + prefix verify, cả hai promote lên sha256 index); `IMAGE_EXTS` về `@oia/schema/uploads.ts` (ipc re-export, loopback dùng chung); `/api/files` key sai → 400, thiếu → 404 (học từ gate: `../` dẫn đầu bị sanitizer bóc thành path trong root → 404, không đi ra ngoài).

Còn treo từ review (đã biết, chưa sửa, không "phát hiện lại" như mới): ký số + auto-update (fuses + NSIS + GC asset: xem mục nhánh `tien/desktop-windows` cuối file), migration zod 3→4 (F4 dư), 500 lỗi JSON → 400, stderr transcript 500 ký tự, port đổi mỗi rebuild, god-file main/index.ts.

## Ghi nhận nhánh `tien/desktop-windows` (2026-10-31)

Nhánh làm nốt phần Windows + nợ còn lại của readiness review. Máy dev của nhánh là macOS, mọi claim Windows bên dưới là **code + test + CI windows-latest**, KHÔNG phải máy Windows thật; cổng máy thật (T6/S3) vẫn treo.

- **T5: CliRuntime trên Windows:** mọi spawn có `windowsHide: true` (app GUI spawn console binary, codex.exe, cmd.exe sau `.cmd` shim, rembg.exe, taskkill, nháy cửa sổ console mỗi lần gọi); `killTree()` tự spawn `taskkill /T /F` trên win32 vì `exec` của tree-kill không nhận option đó; stdout/stderr decode theo stream (`setEncoding`), `chunk.toString()` cắt đôi ký tự UTF-8 3 byte ở biên chunk thành U+FFFD (test 600 KB "ễ" FAIL trên runtime cũ, đã kiểm); PATH đọc không phân biệt hoa thường (`envValue`) vì Windows đặt tên `Path` và mọi bản COPY của env là object thường; `%APPDATA%\npm` vào danh sách well-known. Gate: `packages/providers/test/cli-windows.test.ts` (Unicode + khoảng trắng qua argv/stdin, kill cả cây kể cả cháu, `.cmd` shim chỉ chạy win32, job windows CI chạy nó).
- **T8 + phần fuses của F7: đóng gói Windows:** `electron-builder.yml` thêm `win` (NSIS x64, icon từ PNG 1024) + `nsis` (per-user `%LOCALAPPDATA%\Programs\Oia`, không xin admin, `deleteAppDataOnUninstall: false` → dữ liệu `%APPDATA%\Oia` sống qua gỡ/cài lại/nâng cấp); scripts `dist:win` / `dist:win:dir` (fetch-codex `--platform win32 --arch x64` trước); CI job `desktop-dist-windows` (tag `v*`/manual, cache codex theo pin-tag, assert `win-unpacked/resources/codex/current/bin/codex.exe` tồn tại, sha256 + artifact). Layout gói codex Windows `rust-v0.166.0` đã kiểm bằng tải thật: `bin/codex.exe` đúng chỗ detect `bundled` tìm; gói có thêm `codex-resources/codex-windows-sandbox-setup.exe` → sandbox Windows của codex có bước setup riêng, **phải kiểm ở T6**. **Electron Fuses** (cả hai nền tảng): `runAsNode`/`NODE_OPTIONS`/`--inspect` tắt, asar integrity + onlyLoadAppFromAsar bật, cookie encryption bật, `resetAdHocDarwinSignature` (bản arm64 unsigned vẫn phải mở được). Bằng chứng trên macOS: `dist:mac:dir` → đọc lại fuse wire từ binary (đúng 6 cờ), mở app đóng gói với userData tạm → utility lên, loopback chạy, seed 4 sample; `ELECTRON_RUN_AS_NODE=1 Oia -e …` KHÔNG chạy script. Pin: `apps/desktop/test/packaging-pin.test.ts`. README thêm `dist:win` + hướng dẫn SmartScreen.
- **Ảnh tham chiếu không tới được codex trong app đóng gói (phát hiện 2026-11-02, máy Windows thật, bản zip build từ main + nhánh này):** AI edit trong Editor báo "unknown reason". Lỗi thật (lấy qua DevTools vì không có log): `Invalid package …\file:\C:\…\resources\app.asar`. Ba đường hỏng, **cả macOS** lẫn Windows, chỉ lộ ở bản đóng gói + codex thật (dev chạy `http://localhost`, smoke/shot dùng mock bỏ qua ref): (1) Fabric serialize ảnh studio thành URL tuyệt đối `file:///…/app.asar/out/renderer/studio/…` → `materializeReference` gọi `path.resolve` lên URL; và kể cả resolve đúng, codex.exe không đọc được file **bên trong** app.asar. (2) Ảnh upload đi dưới dạng địa chỉ store `/api/files/<key>` → codex coi là đường dẫn đĩa. (3) B1 "Bring an image → editable" truyền `fileUrl` `/api/files/…` y hệt. Sửa: `materializeReference` đọc `file:` qua `fileURLToPath` và **luôn chép** nguồn local ra file tạm tên ASCII, đuôi theo magic bytes (`sniffImageExt`); `resolveReferenceImages` (`@oia/tasks`) đổi địa chỉ store (`/api/files/`, `oia://files/`) thành data URL, chat service gọi nó **sau pre-flight, trước mọi lượt tính quota** (upload mất → job fail, 0 ảnh), deconstruct gọi cho `fileUrl`. Lỗi rơi vào `unknown` giờ được `console.error` kèm jobId (trước đó UI chỉ hiện class, message bị vứt, không log nào có). Gate: `providers/test/codex.test.ts` (file: URL + thư mục không-ASCII + webp, FAIL trên code cũ, đã kiểm), `services/test/chat-service.test.ts` (ref store tới provider dạng bytes, FAIL trên code cũ, đã kiểm; upload mất → fail trước khi sinh ảnh + có log), `tasks/test/deconstruct.test.ts` (test cũ khẳng định đúng cái bug, đã sửa). Còn treo: log ra file (bản GUI không có console để đọc stdout), đề xuất riêng.
- **T11: dọn asset (phần còn lại của T7):** xoá project không còn để lại ảnh trên đĩa mãi mãi. `sweepUnreferencedAssets` (`@oia/tasks`) quyết định "còn dùng" bằng **văn bản**, không bằng schema: mọi root (projects, chat sessions, templates, brand kits) được serialize rồi quét key `uploads/<ngày>/<file>` dù prefix là `/api/files/`, `oia://files/` hay key trần, field lạ vẫn giữ asset sống (sai thì rò file, không bao giờ xoá nhầm). Chỉ xoá file **không ai tham chiếu VÀ cũ hơn 7 ngày** (grace che upload chưa autosave, generation đang append, kết quả task 24 h). `LocalFileStore.remove()` xoá luôn entry trong cả 3 index dedupe (index cũ sẽ trả URL tới file đã xoá); dedupe hit trên file cũ **làm mới mtime** để grace tính từ lần được trao lại (test FAIL khi bỏ bước này, đã kiểm). Chạy ở utility: sau boot (ngoài đường khởi động) và sau `projects.remove`; lỗi GC chỉ log. Gate: `packages/tasks/test/assetGc.test.ts` + `packages/services/test/asset-gc.test.ts` (ServiceContext thật: asset dùng chung giữa project và session sống sót khi xoá project).
- **T10: zod 3 → 4 (4.6.7):** gỡ advisory cuối cùng của cây ship (GHSA-mrhx-c7xc-m3w5, chỉ vá ở zod 4), `ACKNOWLEDGED` của `desktop-audit.mjs` giờ rỗng, advisory quay lại là gate đỏ. Đổi API thật chỉ 1 chỗ: `z.record()` một tham số → `z.record(z.string(), …)` (`shared/ipc.ts`); `ZodIssueCode.custom` (deprecated) → `"custom"`. Wire contract giữ nguyên: lỗi IPC vẫn nhận diện qua `issues[]` → `IpcValidationError`; tên lỗi và `errorClass` không đổi. Khác biệt chấp nhận: **câu chữ** message validate của zod 4 khác zod 3 (chuỗi `msg` trong envelope 400 của loopback khi params task sai), đó là text cho người đọc, không phải contract. Gate: build + typecheck toàn repo, test toàn repo xanh (schema 14, canvas 39, protocol 12, providers 89, agent 44, tasks 109, services 28, desktop 127), `desktop-audit.mjs` OK không cần acknowledgment.

## Ghi nhận redesign run-progress UI (2026-11-03, nhánh `cuongducle/improve-UI`)

Owner chê vùng progress giữa composer và kết quả ("Researching the web › Planning › Painting" + notes streaming), hai mảnh rời rạc nổi trên nền, state khó đọc. Làm lại + vòng QA visual theo yêu cầu owner ("vài vòng agent đánh giá visual rồi cải tiến").

**Thay đổi UI (UI v1.1 R3 pass 2):**
- `RunPanel` mới (renderer/components/RunPanel.tsx): stepper + notes streaming gom vào MỘT sheet trắng cùng ngôn ngữ card với composer/outline (nền neutral, ink cho chữ, violet CHỈ cho dot AI đang chạy, đúng luật accent). While-busy: stepper giữa card + feed mở tự-scroll + dot live + elapsed timer (ngôn ngữ trung tính "Assistant working", không overclaim). Sau run: dòng `✓ Generated in Ns` (giữ nguyên text, gate regex) + notes thu lại một click.
- `RunSteps` nâng cấp state encoding theo HÌNH DÁNG không chỉ màu: done = check xanh, running = dot violet + ring đứng (sống sót qua screenshot tĩnh), pending = dot xám; connector đổi thành track ngắn 36px, track đoạn done đậm hơn. Bỏ chevron › mờ.
- Feed notes: nền `--soft` bo góc, chữ #4a4950 (contrast ~7:1), normalize `\n{3,}` → `\n\n` (event tự kết thúc bằng \n tạo gap kép).

**Bug thật phát hiện qua vòng QA (B7 họ timeline):** taskMeta của designer flip node "Designer Agent" thành done ở CUỐI run (line ~677), trong suốt vòng refine, timeline đọc "Planning running" dù planner đã xong từ lâu; node "Checking round N/Refining" đóng giữa khi phase cha còn mở → stepper render done BÊN PHẢI pending (bắt được bằng DOM probe: `["running:Planning","pending:Painting","done:Checking round 1"]`). Sửa: designer flip node planner ngay khi plan parse xong; `stepsFromTimeline` gom node vòng refine (`Checking round N|Refining`) ra khỏi track tuyến tính, chúng narrate trong feed (đã stream sẵn). Gate hồi quy: test mới trong ui-v11-shell.test.ts pin đúng case jumble; agent test "timeline narrates both checks" vẫn xanh (taskMeta `<Result>` vẫn chứa đủ node, chỉ UI không xếp tuyến tính).

**Công cụ: `shot:busy` (OIA_DESKTOP_SHOT_BUSY=1, dev-only):** chụp đúng khung busy của mock run (run mock ~1s, poll-and-shoot đua với hoàn tất). Cơ chế: `UtilityClient.setChatHold/stepHeldChatFrames`, main buffer chat events + reply chatRun, thả TỪNG frame cho đến khi UI đạt khung đích (≥1 step done + step trả tiền đang chạy + notes mở + chưa có result), chụp, thả nốt, run phải hoàn tất sạch (exit code chứng minh). Thử Debugger.pause trước đó, pause/resume wedge IPC renderer vĩnh viễn (run không bao giờ xong), bỏ. macOS throttle cửa sổ unfocused làm capturePage trả frame cũ → `setBackgroundThrottling(false)` + double-capture.

**Vòng QA visual (screenshot → vision critique → fix, 5 vòng):** before 6/10 (state mờ, chevron vô hình, 2 mảnh rời, chữ ALL CAPS lệch giọng) → R1 7/10 (card + stepper có state, còn track rời, notes collapse lúc chụp nhầm khung) → R2 6/10 crop hỏng nhưng bắt đúng bug thứ tự step → R3 4/10 (crop cắt hết, nhưng confirm fix thứ tự) → R4 (crop đúng bằng rect probe + verify pixel tự làm: card ALIGN với composer từng px, check xanh có thật) 8/10 → R5 9/10 SHIPPABLE (còn nit: ring stepper mờ, đã tăng #e2d9fb, timer thêm title). Bài học crop: mọi claim alignment/centering từ vision phải đối chiếu pixel/rect probe, 3/5 vòng bị crop tự tạo ra flaw giả.

**Gates đã chạy:** desktop 183 test xanh (kèm regression jumble + pin shot-busy dev-only + pin mock cho OIA_DESKTOP_SHOT_BUSY trong resolveEffectiveMode), agent 81 xanh, services 41 xanh, full `shot` xanh (DA/C1/A1/B1/R4-R6/editor/workspace/tools, gate DA đọc `.aiNotes` textContent vẫn pass), `smoke` OK, `shot:busy` OK deterministic, typecheck desktop 51 lỗi = đúng bằng HEAD sạch (toàn bộ pre-existing env).

**Sự cố quota (ghi thẳng theo B7):** 3 lần chạy shot:busy đầu tiên TIÊU QUOTA CODEX THẬT, `resolveEffectiveMode` chỉ pin mock cho SMOKE/SHOT, không biết flag mới → auto+consent-granted (D13) + binary bundled + login sống trên máy dev = codex thật (research thật "U.S. Labor Day 2026 falls on Monday, September 7" + planner + critic + refine ×3 lần, 2 lần bị app.exit giết giữa chừng). Đã sửa: OIA_DESKTOP_SHOT_BUSY vào danh sách pin mock (test pin cả nhánh packaged=null). Bài học: thêm smoke mode mới PHẢI sửa `resolveEffectiveMode` cùng lúc, flag thiếu trong pin list là lỗ hổng quota mặc định.

**Nợ môi trường (không phải do thay đổi này, đã kiểm trên HEAD sạch):** `pnpm --filter @oia/agent build` fail 12 lỗi implicit-any ngay cả khi stash hết thay đổi (dist từng build OK từ cache turbo cũ, cache che env mismatch; desktop typecheck tương tự 51 lỗi). CI branch chính không bị (env khác). Không sửa im lặng, ghi ở đây chờ owner quyết: либо pin TS version cho worktree, либо dọn implicit-any.

## Ghi nhận vòng teardown + sửa toàn bộ (2026-11-03, cùng nhánh)

Owner yêu cầu xé code của chính vòng redesign trên. Danh sách lỗi tìm được và đã sửa HẾT trong commit kế tiếp:

1. **Nhжет test-hook vào UtilityClient (tội nặng nhất):** cơ chế `setChatHold`/`stepHeldChatFrames` đụng thẳng lớp wire-client duy nhất, không test, đường crash không dọn queue. ĐÃ XOÁ HOÀN TOÀN, thay bằng **mock pacing**: `OIA_MOCK_STEP_DELAY_MS` (registry-only knob, pattern T3) làm mock provider chậm 350ms/lần gọi khi và chỉ khi shot-busy chạy (inject qua `contextEnv`, không mutate process.env). Pipeline THẬT vẫn chạy, chụp được vì nó chậm, không phải vì bị cầm tù. Có test parse (không bao giờ misparse thành gate treo).
2. **Wire contract qua regex chuỗi hiển thị:** `INNER_LOOP = /^(Checking round \d+|Refining)$/` trong renderer là contract ngầm dựa trên label. ĐÃ ĐỔI: schema `taskMeta.type` thêm giá trị `"substep"`, designer đánh dấu node vòng refine bằng field; renderer (`stepsFromTimeline`) lọc theo field. Test pin: label giống nhau nhưng không có `sub` thì vẫn pass-through (quy tắc "unknown names pass through" giữ nguyên).
3. **Bug trung thực sửa dở:** flip node planner sớm tạo gap "all-done giữa chừng". ĐÃ SỬA KIỂU KHÁC: mọi chuyển phase giờ ATOMIC, planner đóng trong cùng snapshot taskMeta mở Image Generator; tool đóng trong cùng snapshot mở Manager Agent. Không event nào mang track all-done khi job còn chạy.
4. **Auto-scroll giành quyền người dùng:** feed giờ chỉ follow khi người đọc ở gần đáy (margin 48px), cuộn lên đọc là giữ vị trí.
5. **Test flag default-deny:** `resolveEffectiveMode` quét prefix, MỌI `OIA_DESKTOP_*` = "1" ép mock, trừ `OIA_DESKTOP_REAL_SMOKE`/`OIA_DESKTOP_PROVIDERS` (allowlist rõ). Cờ tương lai không thể rơi vào provider thật nữa (test dùng tên cờ giả chứng minh). Lưu ý hành vi đổi: `OIA_DESKTOP_SI_SMOKE` giờ cũng mock (trước đó không pin, may là lane đó không đốt quota).
6. **Dọn dẹp:** code chết `lastLog`, `setChatHold(false)` kép, CSS `.aiNotes > div` chết, API chết `onStop/stopIcon` của RunSteps + CSS `.runStepsStop`; hex rải rác → token `--track-done`/`--step-wait`/`--live-ring`/`--feed-ink`; keyframe `runPulse` tường minh 0/50/100 (hết lệ thuộc base shadow ngầm); `startedAt` ref+state gom về một setter `markRunStart`; chuỗi "✓ Generated in Ns" về ownership RunPanel (`summarySeconds`); shotBusy tách sang module riêng `main/shotBusy.ts` (DI, hằng số đặt tên, bỏ `win.focus()`); bỏ toàn bộ log diagnostic ồn, còn một dòng JSON mỗi lần chụp.
7. **A11y:** feed `aria-live="polite"`, step đang chạy `aria-current="step"`.
8. **Editor dock, view thứ hai, giờ có shot check:** shot:busy chụp thêm `desktop-editor-busy.png` (dock đang chạy AI edit). Vision QA: states đọc rõ 7/10; nit còn lại (orphan "image)", composer trống cao, "Creating <prompt>" ghép văn) là CSS/copy CŨ của Editor, không phải lớp mới, ghi nợ ở đây, không sửa lặng.

**ĐÍNH CHÍNH ghi chú vòng trước:** mục "Nợ môi trường: @oia/agent build fail 12 lỗi + desktop typecheck 51 lỗi ngay trên HEAD sạch", SAI. Nguyên nhân thật là **dist của packages trong worktree cũ/không khớp** (cache turbo phục hồi dist lỗi thời; tsc của desktop suy types từ d.ts cũ). Build lại sạch: `pnpm build` TOÀN REPO xanh, agent build 0 lỗi, desktop typecheck 0 lỗi. Không có nợ môi trường, chỉ có dist thối. Bài học: trước khi kết luận "pre-existing env failure", rebuild không cache (`turbo run build --force`) một lần.

**Gates vòng này:** schema 27 / providers 100+1 skip / agent 81 / services 41 / desktop 185 test xanh; `pnpm build` toàn repo xanh; full `shot` xanh; `smoke` OK; `crash-smoke` OK (before=5 recovered=5); `shot:busy` OK cả HAI bề mặt (Home + Editor dock), log một dòng mỗi chụp.

## Ghi nhận vòng health-check + trả nợ 7f (2026-11-04)

Owner yêu cầu check tổng trạng thái rồi "làm hết" các vấn đề còn mở. Kết quả:

- **Gates nền (không cache):** `turbo run build test typecheck --force` 25/25 xanh; desktop-audit OK 0 acknowledgment; ratchet @oia-web = 0; smoke OK events=10, crash-smoke OK before=10 recovered=10, shot xanh, repo khỏe từ đầu.
- **v0.4.1 bỏ dở khâu release:** tag đã đẩy + CI dist mac/win chạy XANH (run 41754984181, artifacts còn sống) nhưng KHÔNG có release nào, đã ghép **draft release v0.4.1** đủ 4 asset (dmg/exe/2 checksums, sha256 verify khớp trước khi upload); publish chờ owner duyệt theo tiền lệ. Notes viết theo phạm vi thật: run-progress sheet + template taxonomy + teardown debt (so v0.4.0…v0.4.1).
- **Draft release v0.1.0 ĐÃ XOÁ** (dmg chứa bug realpath-cache, đã thay asset từ 2026-10-30 nhưng treo suốt), tag v0.1.0 giữ nguyên cho lịch sử build.
- **Nợ 7f trả đầy đủ**: xem mục 7f ở trên; kèm 2 bài học mới vào `cross-platform-support.md` (key là URL part; X_OK/PATH-delimiter theo hệ thật).
- **CI actions rời runtime Node 20 đã về hưu:** checkout v7 / setup-node v7 / cache v6 / upload-artifact v7 / pnpm/action-setup v6 / pages v6+v5+v5, hết annotation deprecation; ubuntu-latest sẽ nhảy Ubuntu 26 (annotation hệ thống, không hành động).
- **Hai gate owner vẫn treo (không thể làm thay):** (a) D10: buổi validation với 3-5 seller thật; (b) import corpus `.data` web thật, đã quét máy lần nữa, không tìm thấy thư mục nào (đúng ghi nhận trước); owner cung cấp đường dẫn là chạy được ngay (nút sẵn, idempotent).
- Gates: CI run 41782005991 (PR #37) xanh đủ 4 job gồm `unit-windows` lần đầu; sau merge main: build/test/typecheck local xanh.

## Ghi nhận Images 2.6: mở workstream IM26 (2026-11-07)

OpenAI phát hành Images 2.6 ngày 4/11/2026 (ChatGPT + **Codex** + API, mọi tier; nhanh hơn 50%; GIF · SVG · markup edit · complexity; giá báo ngang 2.5). Ảnh hưởng trực tiếp hai đường generation của Oia và mở 4 hướng feature mới, ghi thành plan doc riêng [images-2.6-upgrade.md](images-2.6-upgrade.md) (DRAFT chờ owner Q1-Q6, **chưa tiêu quota**):

- **BYO key:** default đang pin `gpt-image-2.5-sunburst`, slice IM26-1 đổi default + 1 generation thật verify.
- **Đường Codex (plan quota):** model sau `chatgpt-imagegen` do server quay, 2.6 có thể đã hiệu lực trên pin `rust-v0.166.0` nhưng chưa có bằng chứng; IM26-2 chạy REAL_SMOKE để đo (nếu phải bump pin thì theo luật D12).
- **Feature lớn nhất: markup edit "khoanh để sửa"** (IM26-3), đúng DNA layers của Oia; cần design doc con nếu owner duyệt hướng.

Không đụng wire contract nào trong đợt ghi nhận này, chỉ docs. Site landing chưa claim gì về 2.6 (chờ bằng chứng thật, Q6).

## Ghi nhận vòng thực thi IM26 (2026-11-07, owner "Duyệt hết")

Workstream [images-2.6-upgrade.md](images-2.6-upgrade.md) chạy slice đầu trong ngày, kèm 1 phát hiện correction scope:

- **IM26-0:** giá chính thức 2.6 = $8/1M image tokens + $5/1M text tokens (ngang 2.5). **Phát hiện: lane BYO không tồn tại trong UI desktop**: `buildServiceEnv` chỉ dựng mock/codex, không có chỗ nhập OpenAI/fal key (đúng thực trạng sau khi D18 rút) → Q2 (model picker UI) giải theo thực tế: giữ env override `OPENAI_IMAGE_MODEL`, không làm UI; IM26-5 SVG + IM26-6 complexity cũng chờ lane BYO.
- **IM26-1:** `OPENAI_IMAGE_MODEL_DEFAULT` → `gpt-image-2.6-sunburst` + pin test mới trong `registry-env.test.ts` (default là quyết định, bump sau này phải chạm test + doc).
- **IM26-2:** REAL_SMOKE trên pin rust-v0.166.0 **OK (events=10, completed)**: lane generation khoẻ sau 2.6 rollout; output không expose model id → "model nào sau chatgpt-imagegen" không đo được từ phía app, không bump pin, không claim marketing (Q6 chốt: landing/README không nói "Images 2.6" cho đường plan).
- **IM26-3:** design doc con [markup-edit.md](markup-edit.md), "khoanh để sửa", 5 slice ME-1…5, code chưa bắt đầu.
- **IM26-4:** quan sát từ smoke, đường codex vẫn trả PNG (không GIF); probe GIF/SVG API hoãn đến khi có key.
- Gates vòng này: packages build 7/7, providers test 113 pass + 1 skip (kể cả pin test mới), full `pnpm build` + `typecheck` xanh; quota tiêu: đúng 1 ảnh thật (REAL_SMOKE IM26-2).

## Ghi nhận vòng probe IM26 trên đường codex (2026-11-08)

Owner: "update codex version lên trước đi" + "dùng codex đi" (sau khi xác nhận máy không có OpenAI API key).

- **Pin bump theo luật D12**: rust-v0.166.0 → **rust-v0.167.0** (stable sau-2.6, 6/11); fetch checksummed OK (sha256 af45ed45…); REAL_SMOKE qua binary mới OK cùng ngày (events=10), cặp 0.167.0 = tested pair, ghi cạnh pin.
- **3 probe thật** (bằng chứng + ảnh: [docs/research/im26-probes/](../research/im26-probes/README.md)):
  - **P2 SVG-as-code PASS**: codex viết SVG vector thật (659B, 18s, 0 ảnh) → IM26-5 mở lại qua lane text, không cần key.
  - **P1 GIF: KHÔNG**: $imagegen từ chối tường minh trên pin sau-2.6; GIF giữ API-only.
  - **P3 markup edit PASS một phần**: ellipse đỏ flatten + chỉ dẫn chữ: model hiểu vùng, tự dọn marker, sửa đúng (lỗi glyph ₫ duy nhất, critic bắt được) → [markup-edit.md](markup-edit.md) cập nhật: ship được trên CẢ HAI lane, codex = flatten-mode.
- Quota cả đợt: 2 ảnh (1 REAL_SMOKE pin + 1 P3). GIF/complexity (IM26-4/6) giữ chờ key.

## Ghi nhận re-certify toàn bộ feature cũ trên pin 0.167.0 (2026-11-08, owner "chạy luôn, quota nhiều")

- **REAL_SMOKE FULL PASS trên 0.167.0**: job0 OK (version=0.167.0, assetBytes 1,82 MB, 51s) · **DA_RESEARCH OK** (--search qua binary đóng kèm, 1 sourced note, 152s) · **DA_REFINE OK-REFINED** (rounds=2, verdict best-effort, critic bắt 4 lỗi, 236s) · **ALL_OK 439s**. Mọi feature cũ có bề mặt tính tiền đều có bằng chứng thật trên cặp đang ship: generation, research, auto refine (kể cả vòng sinh lại), reference edit (probe P3 hôm trước).
- **ĐÍNH CHÍNH BẢN GHI (records must not lie):** 2 lần "REAL_SMOKE OK" tôi ghi 7/11 (IM26-2 + note pin 0.167) là **smoke mock bị đọc nhầm**: `pnpm --filter @oia/desktop smoke` tự set `OIA_DESKTOP_SMOKE=1`, và `smokeModeFromEnv` check cờ này TRƯỚC `OIA_DESKTOP_REAL_SMOKE` → mode hạ xuống mock im lặng dù env real được set ngoài ngoài. Đã sửa cả 2 chỗ ghi (codex-pin.json CORRECTION + images-2.6-upgrade.md). Bài học vận hành: real smoke phải chạy trực tiếp `OIA_DESKTOP_REAL_SMOKE=1 pnpm exec electron .` sau `electron-vite build`, không qua script `smoke`. (Lỗ hổng này không đốt quota, ngược lại: 2 lần tưởng là real mà thật ra mock, tiết kiệm dở.)
- Quota đợt này: 3 job thật trong 1 real smoke (job0 + research + refine 2 vòng).

## Ghi nhận vòng ship ME (markup edit) + vá vận hành (2026-11-08, owner "Oke làm đi")

- **ME-1…5 SHIP, "Circle to edit" chạy được trên lane chính (mock-verified)**: capability `markupEdit: "flatten"` (codex + mock, D14 optional); `editMode.markup` literal ở boundary; clause marker-removal hàn ở agent (đúng ngôn từ probe P3); Editor có overlay annotate (lib thuần 8 unit test, rAF vẽ mỗi frame, lock object trong phiên, Esc 0 quota, skew từ chối thẳng), ask panel "≈ 1 image edit" (ẩn trên mock, luật DA-5), dispatch dùng chung với edit thường → khay A1. Shot gate mới exit 30 + pixel-truth (fabric painted + overlay đỏ thật) + purity pin "annotation không bao giờ vào scene JSON"; artifact `desktop-editor-markup.png`. Field-mode wire hoãn theo lane BYO.
- **2 bug thật bị gate bắt trong lúc làm** (bài học ghi lại): (1) composite quên `crossOrigin="anonymous"` → canvas tainted → toDataURL ném TRONG onload → promise treo vĩnh viễn, giờ try/catch trong onload, không còn treo được; (2) overlay canvas thiếu CSS width/height → attribute width thành CSS size → death-spiral 307200×153600 px mỗi frame, fix 1 dòng CSS nhưng chỉ pixel-truth gate mới nhìn thấy.
- **Vá bẫy env-shadow (bài học 7/11):** `smokeModeFromEnv` giờ cho REAL thắng mọi cờ mock kể cả khi `pnpm smoke` tự set `OIA_DESKTOP_SMOKE=1`; test pin cặp cờ chồng nhau.
- **Deploy config vào repo:** `wrangler.toml` ở root (worker `twilight-sun-6b7b`, account 6b2f7e5e…, assets ./site) + README ghi rõ origin thật của oia.solutions là Worker, không phải GitHub Pages; deploy = `wrangler deploy`.
- Gates: turbo no-cache 25/25; agent 88 / services 42 / schema 27 / providers 113+1skip / desktop 202 test; smoke OK; shot xanh kèm ME scenario. Quota tiêu vòng này: 0 ảnh (toàn mock + shot).

## Ghi nhận thay toàn bộ artwork landing + README (2026-11-08, owner "thay toàn bộ")

Owner: ảnh cũ "thời model cũ, chưa có prompt, rất xấu", regenerate TOÀN BỘ ảnh AI trên landing + README bằng đợt sinh hàng loạt qua codex pin 0.167.0, mỗi ảnh có prompt đầy đủ (provenance: `docs/research/site-artwork-2026-11/`, manifest prompt nằm trong gen.py).

- **15 ảnh mới 1 lần pass QC** (vision, không text lọt vào plate, cặp price-20/30 đúng chính tả + cùng phong cách, laborday 9/10) + **4 ảnh sinh lại sau QC composite**: botanical + ed-poster2 (chữ sáng chìm trên plate sáng → plate mới vùng tối đúng cột chữ), sneaker ×2 (greige → charcoal đậm; lần 2 chỉ còn lỗi wrap text "THE DROP, 12.12" trong template → sửa data studio-templates.ts width/size). Template QA tổng: 12/12 PASS.
- **Ảnh phái sinh dựng lại**: price-repaint.webp (cặp mới ghép ngang), tpl-ed-* bento composites (plate mới), README banner.png (make-banner.py, PASS), og-hero.png DỰNG LẠI hoàn toàn (script mới make-og-hero.py, bản cũ còn nav "Old designs" lỗi thời; 9/10).
- **App assets đồng bộ**: 9 plate + 3 ed-plate đè cả `public/studio/` (site và app dùng cùng artwork), desktop 202 test + shot + smoke xanh sau thay.
- **Deploy**: wrangler deploy (worker v8d870ad3) + verify hash live khớp local từng file.
- **Quota ledger đợt này: 19 ảnh thật** (15 + 3 regen + 1 sneaker lần 2) + planner tokens, owner phóng hạn 2026-11-08.

## Ghi nhận landing + README rework (2026-11-09, D19)

Audit bên ngoài (Playwright 1440/390) phát hiện: hero không giải thích sản phẩm, download bẫi Intel-Mac/iPad, tràn mobile ở section Layers, terminal giả (CLI không tồn tại), 6 script CDN + Google Fonts trên trang quảng cáo "local-first", README 21KB lẫn ghi chú nội bộ. Owner duyệt sửa toàn bộ. Chi tiết quyết định sống ở D19; ledger kỹ thuật của site sống ở `site/README.md`.

- **Landing**: hero mới = studio frame (banner thật `price-20/30` + prompt chip đánh máy đồng bộ + 2 nút repaint 20↔30 · phương án B của audit, kể value prop trong 3 giây); xoá ticker 14 feature, custom cursor, Lenis, GSAP/ScrollTrigger/Draggable/SplitType, three.js grain (thay bằng SVG data-URI ~0KB) → **zero JS/font bên thứ ba**; font self-host `site/fonts/` (fontsource woff2, latin+vietnamese subsets, 252KB); section Layers tĩnh (bỏ pin 55%); footer link hiển thị trên mobile (class `.footlinks` riêng); CTA cuối trang `#download`; terminal = lệnh curl THẬT của agent API; video demo khoác appbar sáng để app light không lặp trên nền tối.
- **Download**: resolver mới trong `main.js`, hỏi `api.github.com/releases/latest` (timeout 3.5s, fallback const v0.4.0), detect arch qua `userAgentData.getHighEntropyValues`, iPadOS (Macintosh+touch) và Intel Mac KHÔNG nhận dmg (giữ link releases + ghi chú "no Intel build yet"); microcopy version/size/OS dưới mọi nút `[data-dl]`; trang mới `/install/` (Gatekeeper, SmartScreen, xattr, checksums) vào sitemap + footer.
- **Ảnh**: `og-hero.png` dựng lại 1200×630 không nút giả (script mới `docs/screenshots/make-og.py`, thay thế `docs/research/site-artwork-2026-11/make-og-hero.py`); `banner.png` dựng lại cân bằng dọc + glow mềm thay hộp đen (make-banner.py cập nhật). Cả hai QA vision 2 vòng.
- **README**: 325 → ~190 dòng, banner mới → 1 câu định vị → Download (cấu trúc bảng + Gatekeeper/SmartScreen) → What you get (ảnh thật) → Providers → Agent API → Build from source → Contributing/limits. Bỏ: bảng before/after trùng landing, FAQ dài (landing giữ FAQ đầy đủ + JSON-LD), tham chiếu D16, "Chế độ thử nghiệm" (→ "Mock, for testing"), đoạn deploy Cloudflare (chuyển `docs/private/landing-deploy.md`; `wrangler.toml` bỏ account_id, deploy cần `CLOUDFLARE_ACCOUNT_ID` từ note đó).
- **Gates**: build/test/typecheck xanh; render Chrome headless 1440px + 390px kiểm không tràn ngang.

## Ghi nhận quét sạch em/en dash toàn repo (2026-11-09, D20)

Sweep một lần theo D20: 261 file, ~3.600 ký tự. Quy tắc theo ngữ cảnh: title/heading đổi thành hai chấm, nhãn đậm thành hai chấm sau nhãn, tag spec (TP.4, D12, C1...) thành hai chấm, nhãn bước hai chữ số thành dấu chấm giữa, cụm chèn ngang thành ngoặc, còn lại dấu phẩy; dải kiểu (M1 đến M4, Sat đến Sun) thành gạch ngang thường. Source và assertion/fixtures được đổi bằng cùng quy tắc nên fixture SSE/stdout và test string-match giữ đồng bộ. Hai chỗ giao diện đổi kèm: cell rỗng bảng API keys đổi sang `N/A` (ForAgents.tsx); placeholder năm trong art template đổi ba em dash dài thành ba gạch ngang thường, dải `SAT` đến `SUN` đổi sang gạch ngang (studio-templates.ts). Glyph hình dòng trong shape picker GIỮ (icon chức năng). Kèm đợt trước: README + toàn bộ site/ + ảnh banner/og tái sinh bằng script PIL (vision QA xác nhận không còn ký tự).

- **Gates**: `pnpm build` / `pnpm test` (16 task, 315 test xanh) / `pnpm typecheck` toàn bộ pass sau sweep.

## Ghi nhận tinh gọn bộ hình marketing (2026-11-09, owner yêu cầu làm lại ít nhưng đẹp)

Ghi đè bộ hình marketing của hai đợt 2026-11-08/09 phía trên, không thay template hay asset trong app:

- Thay toàn bộ 45 file cũ trong `site/assets/` bằng 6 file: MORI matcha, bản sửa 20% thành 30%, FORMA mỹ phẩm, editor thật, ảnh so sánh và social card. README có một ảnh bìa mới. Bỏ video, gallery nhiều mẫu và các script ghép cũ.
- Trang template giữ nội dung dạng mục lục bằng chữ; ảnh sinh mới không được gắn nhãn template có sẵn. Chụp editor thật với layer ghi chú được chọn; caption phân biệt baked lettering và native text. Ba ảnh sinh trực tiếp qua Codex 0.167.0, không claim là run Oia đủ research/auto-refine. Không thay quyết định D8/D19 hoặc pin runtime.
- Có 3 vòng xem và sửa: artwork + hero; editor + so sánh; desktop/mobile + README bề ngang 830px. Hai lượt review vision độc lập trên hero (đầu/cuối), lượt cuối không còn blocker trực quan nghiêm trọng. Bỏ tự gõ chữ/tự chuyển ảnh; giữ nút thử repaint, brief cập nhật đúng trạng thái. So sánh đặt hai ảnh cạnh nhau vì slider che mất khác biệt ưu đãi.
- Gate: kiểm 28 local media references xanh + 3 regression test; template builder và composite builder chạy được; JS syntax và diff check xanh; desktop build/typecheck xanh; Chrome thật qua bsk ở 1440×900, 390×844 không ảnh lỗi/tràn ngang, thử 20%/30% khớp ảnh/brief. Thêm kiểm tra media trước GitHub Pages deploy. Chưa chạy CI từ local, không full test/smoke/crash-smoke, không Windows thật, không deploy production.
- Chi tiết vòng review, giới hạn bằng chứng và provenance: [`../verification/marketing-assets.md`](../verification/marketing-assets.md), [`../verification/marketing-assets-provenance.json`](../verification/marketing-assets-provenance.json). Quota vòng này: 3 ảnh thật (2 tạo mới + 1 sửa tham chiếu), không sinh lại trong lúc chụp editor.
- **Hậu kiểm deploy (owner yêu cầu push/deploy toàn bộ):** đã push các commit local lên `main`, code SHA `c90f720`; Cloudflare version `e9cad6c4-b906-453f-9041-08bb3abd38fb` đã lên `oia.solutions`. GitHub Pages run `42559638292` xanh; CI `42559638291` xanh đủ build/test/typecheck, desktop-smoke, desktop-smoke-windows, unit-windows (dist jobs skip đúng trigger, không phát hành installer). Chrome thật xác nhận 9 file live trả 200 và SHA-256 trùng local, gồm HTML/JS/CSS và 6 asset. Không cần purge cache. Chi tiết bằng chứng ở mục phát hành trong bản ghi verification phía trên.

## Ghi nhận audit tính năng và pack hình xem trước (2026-11-09)

- Theo yêu cầu owner, đối chiếu tính năng đã ship với code và ledger, chọn câu chuyện ảnh sản phẩm → quảng cáo → sửa ưu đãi → editor → xuất file; livestream là use-case riêng. Chi tiết: [landing-feature-audit.md](landing-feature-audit.md).
- Pack độc lập ở `site/feature-review/`: 5 hình chính, 2 bản mobile dọc, 1 bảng tổng hợp; không sửa `site/index.html`, không thay template/app, không deploy. Sinh đúng 2 output AI mới qua Codex 0.167.0: sản phẩm STILL hư cấu và chiến dịch có đính kèm ảnh sản phẩm. Không claim run Oia đủ planner/research/refine. Prompt/thread/mã băm được lưu cùng pack.
- Ảnh editor và livestream là nguồn Electron đã có, không vẽ UI giả hoặc sửa nội dung screenshot. Không đánh tráo chữ baked thành layer, không hứa PPTX native text, guide nền tảng chính thức hoặc tự động giữ nhận diện tuyệt đối. Make text editable có sẵn nhưng chưa có demo deconstruct thực trên artwork mới trong pack này.
- Gates: composite builder chạy được, media audit 35 reference xanh; Chrome thật qua bsk 1440×1000 và 390×844 không overflow, bản mobile tải đúng `picture/source`; xem trực tiếp artwork và screenshot render, review vision độc lập hình 01 không có blocker crop/màu/overlap. Sửa caption dài và bổ sung mobile dọc sau review. `git diff --check` xanh. Không full build/test/smoke/crash-smoke hoặc gate Windows mới, không đổi code desktop; các gate phát hành còn treo giữ nguyên.
- Hướng dẫn tái tạo và giới hạn kiểm tra: `site/feature-review/README.md`. Trang là review có noindex, không thêm vào điều hướng/sitemap landing.

## Ghi nhận D21: Split layer chạy local bằng SAM 3 ONNX (2026-11-09, owner "làm đi và tối ưu")

- **Quyết định:** task `segment-image` (schema enum mới) chạy engine **SAM 3 int8 ONNX thuần local** trong utility process: vision encode 1 lần/ảnh (cache theo content hash, 6-8 giây CPU), mỗi text prompt 1-2 giây, **0 quota provider**. Nút "Split layer" trên ContextToolbar ảnh (cạnh "Make text editable"), dialog prompt + chips, cutout chèn thành layer đè lên ảnh gốc (giống SurgePix: giữ nguyên layer gốc).
- **Model:** danilobukvic/sam3-text-onnx int8 (880 MB, 3 graph + tokenizer CLIP), **download-on-first-run** vào `<userData>/models/sam3`, sha256 pin + atomic rename (không bao giờ bundle vào installer: cả kích thước lẫn Meta SAM License). Bằng chứng chọn model: PoC đối đầu 6 bản ONNX + 3 đường (PyTorch MPS, ONNX node, SAM3-tracker), IoU 0,994 so PyTorch BF16, chi tiết `docs/private/surgepix-feature-audit-2026-11-09/poc-local-segment/RESULTS.md`.
- **Kiến trúc:** onnxruntime-node + pngjs là dep của apps/desktop (native, cần asarUnpack khi đóng gói: noted nợ packaging); engine `src/utility/segmentation/` (engine/models/compose/clip-bpe) inject vào createServiceContext qua `opts.segmenter` (workspace packages sạch native dep); IPC `segment:status`/`segment:download` poll-based (không thêm event wire); taskResult mở rộng field `objects` (additive theo D14, không bump schema version).
- **Tối ưu đã đo:** int4 KHÔNG nhanh hơn int8 trên CPU (6,0 vs 5,8 giây) nên giữ int8; intraOpNumThreads mặc định đã tối ưu; cache vision embedding là đòn bẩy thật (prompt 2+ trên cùng ảnh: 1-2 giây).
- **Gate:** build/test/typecheck toàn repo xanh; 13 test mới (processor 4: happy/honest-empty/thiếu engine capability_unsupported/param sai; compose 4: threshold/alpha-roundtrip/maskBox/preprocess; models 2: checksum mismatch dọn tmp + install nguyên tử; BPE 3: SOT-EOT pad 32/lowercase/cut 32); DESKTOP_SMOKE OK events=10.
- **Nợ ghi sổ:** (1) asarUnpack onnxruntime-node + smoke trên bản đóng gói thật; (2) chạy thử end-to-end với model thật trên máy owner (dialog download 880 MB → prompt → cutout); (3) đọc kỹ Meta SAM License trước khi phát hành rộng (download runtime có thể cần điều khoản riêng); (4) Windows: cùng bộ ONNX CPU EP nhưng chưa đo trên máy Windows thật (D3); (5) shot gate cho view Split layer dialog.

## Hoàn thiện asset tính năng và báo cáo SurgePix, sau sửa D22/D23

- Tích hợp vào landing/README: cặp ảnh tham chiếu STILL, editor thật, ba ảnh
  Make text editable, crop livestream; giữ các artwork MORI/FORMA. Dùng ảnh
  rời với HTML responsive thay ảnh ghép ba khung thu nhỏ trên điện thoại.
- Builder công khai `docs/screenshots/build-feature-assets.py`, bảy đầu ra và
  mã băm ở `docs/verification/feature-assets.json`, không thêm quota. Không
  dùng PoC Split layer làm bằng chứng app khi các gate D21 bên trên còn mở.
- Báo cáo riêng tư SurgePix có Markdown/HTML, bảy minh họa + mẫu Oia, nguồn
  và manifest; phân biệt quan sát/suy luận/chưa biết. Rút khẳng định giá vốn,
  model cụ thể và self-host chưa có chứng cứ, sửa nhận xét typography quá mức.
  Capture/asset đối thủ không được đưa vào site công khai.
- Gate đợt media/docs: builder/report chạy được; media audit ba self-test và
  45 tham chiếu đạt; link report tồn tại; diff check đạt. Chrome thật kiểm
  landing desktop/mobile, README preview và report mobile; không overflow,
  ảnh tải đủ, link use-case hoạt động. Chụp report desktop bị timeout bsk,
  không ghi là pass. Nội dung site hiển thị ngay, không đợi reveal observer.
- Trước push theo yêu cầu owner: chạy lại build (8 tác vụ), test (16),
  typecheck (15), mock Electron smoke (`events=10`), crash-smoke (31 project
  trước/sau), shot (gõ chữ, reload/clone/Enter/textbox thường đều đạt), media
  self-test/audit và diff check. Không chạy task trả phí hoặc model thật.## Phát hành v0.6.0 (2026-11-10, owner "push deploy tạo tag")

- Release commit fa207ed (bump 0.6.0) + tag v0.6.0. CI tag run 42814394825
  XANH TOÀN BỘ: ci, smoke, unit-windows, smoke-windows, dist-mac 5m6s (kèm
  packaged-smoke SG-2 chạy trong CI lần đầu), dist-windows 6m32s.
- GitHub release v0.6.0 (Latest): dmg arm64 428.182.436 B + exe x64
  413.867.838 B + 2 checksums; SHA-256 đối chiếu checksum CI trước khi upload.
- Site: fallback main.js + nhãn v0.6.0 (commit dda7a6b), wrangler deploy
  twilight-sun-6b7b (version 448baf80); verify live: releases/latest = v0.6.0,
  size khớp, oia.solutions 200. Nội dung: PPT Translator, Remove background,
  Crop, packaged-smoke mỗi tag, 6 bug biên provider bắt nhờ real-data, sidecar
  SAM + fix Windows từ lane song song.
- Vẫn không ký (kế hoạch ngân sách không-signing): hướng dẫn vượt Gatekeeper/
  SmartScreen giữ nguyên trong release notes; chưa có auto-update.

## Phát hành v0.5.0 (2026-11-10, owner "triển khai hết")

- Cloudflare `twilight-sun-6b7b` deploy hai lần cho landing mới + fallback
  text v0.5.0; 10 file khớp SHA-256 same-origin. Chi tiết ở
  `docs/verification/marketing-assets.md`.
- Release desktop v0.5.0 publish (Latest): dmg arm64 + exe x64 + checksums,
  SHA-256 đối chiếu CI, notes công bố Lens phi thương mại, SAM 3 tải khi dùng
  đầu, unsigned và không auto-update.
- CI dist job phải sinh `resources/lens` trong runner (pip torch build-time,
  venv workspace trên mac vì PEP 668). Lần tag đầu fail đúng dist-mac, sửa
  rồi re-tag cùng tên, không rerun SHA cũ.
- Nợ D21 cập nhật: (1) ĐÓNG (commit b0c9588, SG-2): cấu trúc dmg thật + boot
  profile thật đã xác minh, scripted packaged-smoke với userData tạm đã có
  (`pnpm --filter @oia/desktop packaged-smoke`, env `OIA_USER_DATA_DIR` tuyệt
  đối, từ chối profile mặc định, fail sớm khi không ghi được); (2) e2e model SAM
  880 MB trong app đóng gói vẫn mở; (3) Meta SAM License chưa đọc kỹ, notes
  phát hành đã nêu license riêng của model; (4) Windows: CI runner xanh, máy
  vật lý vẫn mở; (5) shot gate Split dialog vẫn mở.
- Bài học: app đóng gói không có test-mode userData; một lần chạy nhầm vào
  profile thật đã để asset GC dọn 2 upload mồ côi (đúng chính sách boot thường
  xuyên). Cần cơ chế override userData cho packaged smoke trước khi lặp lại.
- Phát hiện phân phối (2026-11-10, khi đóng SG-2): bản build local unsigned
  với fuse `enableCookieEncryption` lần đầu boot có thể treo vĩnh viễn sau một
  dialog keychain "Oia Safe Storage" không ai bấm (identity ad-hoc đổi mỗi
  build, ACL key cũ không khớp). Triệu chứng: không cửa sổ, không log, process
  sống. Đã ghi cơ chế dọn key trong `scripts/packaged-smoke.mjs`; hết hẳn khi
  có signing thật (SG-12).

## Ghi nhận thu hẹp khoảng cách gate CI vs docs (2026-11-10, owner "1b, bỏ 2 cờ")

Đối chiếu "lời hứa gate" trong docs với test thật phát hiện CI xanh hẹp hơn
những gì docs tuyên bố đã verify. Hai quyết định owner:

- **Shot gate là gate MÁY OWNER, có chủ đích, không đưa vào CI (chọn phương án
  1b).** Mọi pixel-claim (D22 đo pixel chữ, C1 outline card, ME markup, DA cost
  label, SG-7 verify PPT Translator, SG-9 rembg giữ layer) chỉ có hiệu lực khi
  owner chạy `pnpm --filter @oia/desktop shot` (và `shot:busy`) trước khi phát
  hành. CI xanh KHÔNG bao gồm kiểm thị giác, đã ghi chú thẳng trong ci.yml cạnh
  job desktop-smoke. Lý do không chạy CI Linux: chưa đo độ ổn định trên xvfb
  (font Be Vietnam Pro, timing chụp pixel); ai đó định nâng lên gate CI thì đo
  flake trước rồi xóa mục nợ này. Bài học giữ lại từ antipatterns: từng có 2
  tuần thumbnail vẽ cụt nửa vì gate chỉ check element tồn tại, thị giác phải có
  mắt.
- **unit-windows mở rộng chạy TOÀN BỘ unit suite** (bỏ 2 cờ filter cũ chỉ
  `@oia/tasks` + `@oia/providers`). Từ 2026-11-10, schema/protocol/canvas/
  agent/services không còn mặc định giả định POSIX trên Windows. Comment 7f cũ
  trong ci.yml nói "whole unit suite" nhưng filter chỉ 2/7 package: lời comment
  giờ mới đúng sự thật. Nếu package nào đỏ trên Windows thì đó chính là loại
  bug thầm lặng job này tồn tại để bắt: sửa hoặc ghi nợ đích danh, không thu
  hẹp filter lại.

Kèm theo trong cùng đợt (commit 5dc2db6): 2 defect bug-repro 2026-10-30 số 3
(quit race) và số 4 (không RPC timeout) có đủ regression gate như doc tự hứa;
CI dist-mac chạy packaged-smoke trên artifact vừa build mỗi tag v*.

## Ghi nhận SG-1 e2e thật phát hiện crash nền tảng của Split layer (2026-11-10)

Owner duyệt chạy thật toàn luồng SAM (quota thật không dùng vì engine local).
Kết quả: download model 880 MB ~100 giây đúng thiết kế, dialog đúng, nhưng task
`segment-image` giết utility process bằng SIGTRAP (hiện trên UI là "exit code
5"). Ma trận thí nghiệm chứng minh root cause: mọi process liên kết Electron
trên macOS có malloc đi qua zone shim PartitionAlloc của Chromium, ONNX Runtime
CPU EP cần khối aligned cỡ GB khi vision-encode 1008px và bị trap. Node thuần
(21/22/25) chạy trọn pipeline 31,5 giây, tìm đúng vật thể score 0,939. Không
cứu được bằng CoreML EP (CPU fallback vẫn chết), giảm thread, tắt arena, hay
ELECTRON_RUN_AS_NODE (shim nạp cả ở chế độ đó). Nút Split layer vì vậy đang là
feature chết chìm trong mọi bản build macOS; Windows khả năng cao tương tự,
chờ máy vật lý (D3). Chi tiết bằng chứng, khảo sát ngành (node-llama-cpp,
@electron/llm, Ollama/LM Studio sidecar, transformers.js wasm) và các phương
án kèm khuyến nghị sidecar native runner nằm ở
`docs/designs/segmentation-process-plan.md` (chờ owner chốt hướng). Gate thật
chạy tay Node thuần giữ tại `apps/desktop/test/segment-real.manual.test.ts`.
Vụ này cũng xác nhận giá trị của gate e2e thật: 13 test unit + smoke mock đều
xanh trong khi feature không chạy nổi 1 giây trong app thật.

## Ghi nhận ship sidecar SAM (option A, 2026-11-10, owner "A đi")

Triển khai trọn vẹn trong ngày quyết định: crate Rust `segment-runner`
(JSON-lines, ORT load-dynamic từ lib pin 1.31.1, cache vision LRU 2 trong\nrunner), client `runner.ts` Electron-free có test error-path bằng fake runner\nthật (crash giữa chừng chỉ là promise reject + respawn, generation bump xóa\ncache), engine giữ nguyên tokenize/preprocess/postprocess (chất lượng trùng\nkhớp tuyệt đối bản in-process), capability gate khi thiếu sidecar,\nprepare-segment + extraResources + Rust toolchain trong cả hai dist job CI.\nE2E đã pass: Node thuần qua sidecar (18,6 giây, box/score trùng), GUI trên dev,\nGUI trên macOS ĐÓNG GÓI (toast "1 layer cut out" ~20 giây, không crash). Một\nbug path đóng gói bắt được khi chạy thật: packaged ghép resourcesPath +\n"resources" thành đường kép, sửa theo pattern codex. Bẫy keychain ad-hoc tái\ndiễn đúng như ghi nhận (mỗi lần build local mới), script packaged-smoke tự dọn\nđủ. Chi tiết đầy đủ: segmentation-process-plan.md (status: implemented).

## Ghi nhận mở rộng sidecar cho Lens (2026-11-10, owner "còn model nào chuyển qua luôn")

Model cuối cùng còn chạy ORT trong process Electron là Lens (D22 font
classifier, lens.ts). Đã chuyển sang cùng sidecar SAM: op `lens` trong runner
(cpu + 4 thread như cũ), checksum + catalog + ranking giữ nguyên TS, một
runner child dùng chung (spawn lười). Kiểm chứng: cùng tensor cho logits 983
chiều TRÙNG K BIT giữa đường in-process cũ và sidecar (max diff 0,0). Từ đây
utility process không còn import onnxruntime-node; mọi ORT chạy trong tiến
trình native riêng, crash model không bao giờ giết tầng services.

## Rà soát template đóng kèm (2026-11-12, owner yêu cầu)

Bản ghi chi tiết: [template-bundle-audit.md](template-bundle-audit.md).
Kho chung có 35 mẫu, đủ 8 nhóm taxonomy: 30 Studio + 3 livestream trước đây
chỉ hiện trong Editor + 2 Overlay mới. Home không còn gộp nhóm thành
Poster/Social/Branding; Editor phân nhóm cùng taxonomy. Featured vẫn lọc
được nhóm. Giữ id mẫu và không ghi đè tài liệu người dùng đã lưu.

Sửa 14 mẫu Studio về tương phản, khoảng cách, copy hoặc bố cục; hai bìa
thuyết trình chuyển sang 16:9. Countdown frame ghi rõ Static vì chỉ là đồ
họa chữ, không có bộ đếm chạy. Nền tạo bằng mã có chủ đích không phải mock.
Không sinh ảnh mới, không phát sinh quota; ảnh quà dùng lại asset có sẵn.

Gates macOS: build/test/typecheck toàn repo, smoke, crash-smoke, shot xanh.
Shot mới bấm đủ 8 nhóm trong app thật. Harness `template-qa` dựng 35 scene
bằng Electron/Fabric, phông và ảnh thật: 0 chữ tràn trang, 0 cặp khung chữ
chồng nhau sau sửa. Đã mở bảng ảnh và ảnh gốc các mẫu sửa chính. Bằng chứng
ở `docs/private/real-runs/2026-11-12-template-bundle/`. Chưa chạy Windows
máy thật; không tuyên bố kiểm chứng thị giác tự động hay một concept mới.

**Vòng sửa theo phản hồi owner, cùng ngày:** owner bác việc giữ mẫu chỉ có
nền màu/chữ. Đã chạy 8 lượt sinh ảnh thật qua `generate-poster` và context
thật (8 thành công, 0 retry, 0 planner, 0 read). Thay 7 nền phẳng còn hoạt
động và nền bìa perspective, bố trí lại chữ theo ảnh. Cả 30 Studio template
nay có ảnh nền/chủ thể; Overlay/livestream vẫn trong suốt đúng công dụng.
Asset mới có hậu tố `-ai-20261112`, giữ URL cũ để tài liệu đã lưu không tự
đổi nền. Test buộc scene dùng ảnh mới và prompt khớp manifest thật. Đã mở
ảnh nguồn, ảnh hoàn chỉnh và bảng trước/sau. Gates cuối: build/test/typecheck,
smoke, crash-smoke, shot, template-qa xanh; 35 scene không tràn/chồng khung
chữ, desktop 288 test qua và 1 manual test bỏ qua. Bằng chứng riêng:
`docs/private/real-runs/2026-11-12-template-backgrounds-ai/`. Không tuyên bố
owner đã duyệt thẩm mỹ, không có kiểm Windows máy thật.

## Phát hành v0.6.1 (2026-11-12, owner yêu cầu)

Tag `v0.6.1` trỏ `71a28f8`, GitHub release đã công khai và đặt Latest.
CI tag run `43147338780` xanh đủ 6 job: ci, unit-windows, desktop-smoke,
desktop-smoke-windows, desktop-dist-mac, desktop-dist-windows. Bản macOS
đóng gói còn qua packaged-smoke. Không tuyên bố Windows máy vật lý đã chạy.

Hai bộ cài lấy từ chính artifact CI, tải về đối chiếu SHA-256 với checksum
của runner, rồi đối chiếu digest GitHub sau upload, đều khớp:

- `Oia-0.6.1-arm64.dmg`: 433574780 byte,
  `bf002c187f496a197384aab3c97d386020044569939d34090a2c321b4bb3f918`.
- `Oia-0.6.1-win-x64.exe`: 419234278 byte,
  `e5b89eb802d86a7469552ce7494ae3879e77430c93b2200869a23223a06e3836`.

Kèm `checksums-macos.txt` và `checksums-windows.txt`. Giữ phân phối unsigned,
không tự cập nhật; release notes nhắc giấy phép model và giới hạn so phông.
Nguồn: https://github.com/cuongducle/oia/releases/tag/v0.6.1.
Bằng chứng tải về và notes ở `docs/private/releases/`. Site SEO/fallback
không nằm trong lượt phát hành này; resolver GitHub Latest vẫn tìm bản mới.

## Landing và README sau v0.6.1 (2026-11-12, owner yêu cầu rà ảnh xấu)

- Giữ ảnh MORI, FORMA và cặp STILL đã xem; bỏ bộ minh họa chữ nền nâu
  và ảnh livestream caro khỏi landing/README. Không dùng ảnh nền trần để
  giả làm mẫu hoàn chỉnh. Livestream giải thích bằng chữ, giữ đúng bản chất
  trong suốt và countdown tĩnh, không dựng ảnh video hay giao diện giả.
- Xuất 30 ảnh WebP từ scene Studio thật qua Electron/Fabric, không cắt bố
  cục. Landing/README chọn ba ảnh mẫu mới; hub và các trang nhóm/style/pack
  dùng đủ catalog 35 scene từ desktop, không duy trì danh sách tên mẫu riêng.
  Thêm trang Livestream và Overlay cùng liên kết sitemap. Năm đồ họa trong
  suốt hiển thị thông tin, không ghép ảnh quảng cáo đánh tráo công dụng.
- Ví dụ menu 42.000₫ thành 46.000₫ là một lần sửa chữ native. Exporter buộc
  PNG nguồn chỉ khác trong khung giá (891, 558, 930, 582); WebP công khai là
  nén mất dữ liệu. Không gọi đó là chứng cứ OCR hay trả quota sinh ảnh mới.
- README/link tải/fallback lên v0.6.1, kích thước đúng 413/400 MiB. Sửa luôn
  lỗi fallback ghép tag bản mới với tên file bản cũ khi thiếu asset nền tảng;
  có test mất mạng, thiếu asset, bản mới đủ asset và hệ không hỗ trợ. Sửa
  mức đọc ảnh OCR thành tối đa 6 lượt và bỏ mô tả PPT Translator còn placeholder.
- Gates local: build/test/typecheck toàn repo, template-qa 35 scene không
  tràn/chồng khung chữ, media audit 149 tham chiếu + 31 SHA-256, 4 self-test,
  4 test download và diff check đều đạt. Chrome thật qua bsk kiểm desktop
  1224 px và mobile 390 × 844, bấm mẫu menu mở đúng 4 mẫu, không tràn ngang
  hoặc lỗi console. Đã mở xem đủ 30 preview trên bảng ảnh, ảnh gốc và ảnh
  Chrome. Chụp toàn trang bị bsk chặn vì page hidden, chỉ nhận các ảnh viewport
  thực sự chụp được, không dùng ảnh ghép làm chứng cứ kiểm toàn trang.
- Tái dùng ảnh thật đã sinh ở đợt template, không gọi provider thêm. Chỉ sửa
  site, docs và harness; không sửa bản cài hay đổi tag v0.6.1. Bằng chứng ở
  `docs/private/real-runs/2026-11-12-marketing-v061/` và manifest công khai
  `docs/verification/template-marketing-assets.json`. Không tuyên bố owner
  đã duyệt thẩm mỹ hoặc đã chạy Windows máy thật.
- Đã push `98f0670`, deploy Cloudflare và GitHub Pages. Đối chiếu SHA-256
  52 file công khai (HTML/JS/CSS/sitemap và đủ 31 ảnh mới) với file commit:
  tất cả khớp, tải bằng curl HTTP thành công. Python urllib nhận 403 theo
  tác nhân HTTP nên không tính lượt đó là kiểm đạt. Pages run `43153223534`
  xanh; CI run `43153223616` xanh 4 job, 2 job đóng gói bỏ qua đúng chính
  sách chỉ build bộ cài theo tag. Không phát hành lại ứng dụng.

## Nút tải hai nền tảng (2026-11-12, owner "nút download phải có cả mac cả windows")

- Hero và mục Download cuối trang giờ hiện sẵn hai nút macOS + Windows; trang
  install tương tự. Bỏ logic đo hệ điều hay Apple Silicon/x86 để chọn một nút
  duy nhất: người dùng không thể tải nhầm nền tảng còn lại chỉ vì đang xem
  trên máy này.
- Resolver giờ cập nhật từng nút độc lập theo GitHub latest: thiếu asset nền
  tảng nào thì nút đó giữ fallback v0.6.1 đúng cặp tag + tên file, không trộn
  tag bản mới với file cũ. Ghi chú dưới nút ghi đúng nhãn, dung lượng MiB và
  phiên bản của từng nền tảng.
- Test tải viết lại theo hành vi mới (3 test: mất mạng giữ đúng 2 file v0.6.1,
  bản mới đủ asset chuyển cả hai nút, bản mới thiếu một nền tảng không trộn
  tag). Media audit 149 tham chiếu + 4 self-test đạt. Chrome thật kiểm desktop
  1193 px: hai nút cùng hàng, không tràn; mobile 390 × 844: hai nút xếp dọc,
  ghi chú hai dòng, không tràn ngang; trang install tương tự, console sạch.
  Bản thân ảnh chụp không mở xem được trong phiên này, kết luận dựa số đo
  bounding box thật của Chrome, không phải kiểm thị giác bằng mắt.

## Nút tải trực tiếp mọi trang + nút navbar bị che (2026-11-12, owner
"user bình thường ko biết download release đâu" và "nút download bị che")

- Bỏ nốt các nút dẫn sang trang GitHub releases (nav + hero của templates,
  prompts, use-cases). Mọi trang giờ có hai nút bấm thẳng file
  `Download for macOS` / `Download for Windows`; link tĩnh v0.6.1 chỉ là
  fallback, các trang này đều tải `main.js` nên resolver tự lấy bản latest
  theo từng nền tảng. Media audit thêm rule fail trang có `data-dl` mà không
  tải `main.js` (kèm self-test), chống tụt về link tĩnh cũ.
- Nút Download trên navbar trang con bị "che" gồm ba lớp lỗi chồng nhau:
  (1) chữ xám nhạt gần vô hình vì `.pageNav a` (0,1,1) đè màu `.btn-accent`
  (0,1,0), sửa bằng rule màu riêng; (2) extension đọc (kiểu Speechify/
  ReadAloud) ghim các `<nav>` phụ thành `position:fixed` trên đầu trang,
  nó còn copy theo z-index navbar (đặt 50 nó thành 50, đặt 200 nó thành
  200), đè giữa nút; sửa bằng đổi hàng chip `catNav` từ `<nav>` sang
  `div role="group"` và nâng z-index navbar lên 200. Không quy tội CSS
  site: đã quét toàn bộ stylesheet + adoptedStyleSheets, không rule nào
  đặt fixed cho catNav; đo trong Chrome thật có extension: trước click
  bị chặn "pointer target covered" và elementFromPoint trả về catNav,
  sau sửa click thành công, nút nguyên vẹn.
- Kiểm chứng bằng Z.AI Vision theo yêu cầu owner (phiên agent không tự xem
  được ảnh): trước sửa Vision đọc nút navbar là "viên thuốc tím không chữ,
  cắt nửa dưới"; sau sửa đọc đúng chữ "Download" trắng, đủ bốn góc, không
  bị che; hai nút hero đọc rõ nhãn trắng. Ảnh headless Chrome không tải
  font nên chữ biến mất trong ảnh chụp nhanh, không dùng làm bằng chứng.
- Gates: media audit 5 self-test + 149 tham chiếu (kèm rule resolver mới),
  3 test download, diff check. Chrome thật desktop + mobile 390: hai nút
  xếp đúng, không tràn ngang; prompts/templates href trực tiếp, `main.js`
  tải. Chưa kiểm Windows máy thật; không đổi tag v0.6.1.

## Landing chuyển sang Astro (2026-11-12, owner "astro đi" sau khi duyệt review)

- `site/` thay bằng `apps/site`: Astro 7.4.11 pin chính xác, output static
  thuần, không adapter, không client framework. public/ (main.js, styles.css,
  pages.css, fonts, assets, sitemap, robots, feature-review) ship nguyên bản,
  không hash không bundle. Giữ nguyên mọi hành vi vừa sửa: hai nút tải trực
  tiếp + resolver latest theo nền tảng (main.js verbatim, test cũ giữ nguyên
  chỉ đổi đường dẫn), catNav là `div role=group`, navbar z-index 200, link
  tương đối để bản github.io subpath không vỡ.
- 13 trang templates cũ sinh bằng build.py giờ là 1 dynamic route
  `templates/[...slug].astro` từ `src/data/catalog.json` (bản ghi catalog giữ
  nguyên nội dung, di chuyển vị trí) + taxonomy dùng chung `src/data/taxonomy.ts`.
  Nav/footer lặp tay 21 file thay bằng layout `Page.astro`; landing giữ shell
  riêng trong `index.astro`. JSON-LD và khối code có brace chuyển sang
  frontmatter + `set:html`.
- peer vite xung đột: electron-vite 4 đòi vite ^5-7, Astro 7 kéo vite 8.
  Fix bằng khai báo tường minh `vite ^7` trong devDependencies của
  @oia/desktop để hai app cô lập toolchain (desktop 7.3.7, site theo Astro).
- Tooling theo cấu trúc mới: marketing-assets.py quét `apps/site/dist` SAU
  build (workflow Pages thêm bước build; self-test fixture theo bố cục
  dist/public mới, 5 test), provenance manifest đổi đường dẫn asset sang
  `apps/site/public/assets/...`, export-previews.py dọn sang
  `apps/site/scripts/` (ghi catalog + ảnh + provenance đúng vị trí mới),
  builder ảnh docs/screenshots và README đổi đường dẫn, wrangler.toml trỏ
  `./apps/site/dist`, workflow Pages paths theo apps/site/** và có bước
  `pnpm --filter @oia/site build` trước audit + deploy.
- Quy ước agent ghi thành `apps/site/AGENTS.md` (link tương đối, DownloadButtons
  component, brace=set:html, catNav không dùng nav, pin Astro, audit bắt buộc
  sau build); `apps/site/README.md` mô tả đầy đủ contract + kế hoạch blog
  (content collections, chỉ tài liệu hóa, chưa dựng code).
- Bằng chứng ngang hàng: screenshot landing trên bản Astro **byte-identical**
  với bản HTML tay (1432161 byte, cùng viewport) = pixel-perfect. Link-check
  nội bộ 21 trang 0 gãy; DOM check mọi trang: 2 nút data-dl + main.js, hub 35
  thẻ/30 ảnh, swiss 7, tet 6, flash-sale 5, không tràn ngang, console sạch.
  Z.AI Vision duyệt hub PASS (nút navbar chữ trắng rõ, hai nút tải đọc rõ,
  chip đủ 8 nhóm đếng đúng 35). Script copy prompt có mặt trong dist nhưng
  clipboard cần cử chỉ thật nên không mô phỏng trong tab nền; ghi nhận là
  giới hạn kiểm, không phải lỗi.
- Gates: pnpm build/test/typecheck toàn repo (turbo gồm @oia/site), media
  audit 5 self-test + 149 tham chiếu, 3 test download. Chưa deploy lúc ghi
  dòng này; kết quả deploy và đối chiếu live ghi ở evidence riêng.

## Vá đợt review code Astro (2026-11-12, owner "tear it to shreds" rồi "sửa hết")

Review thẳng đã chỉ ra và đã sửa hết, commit `5f5c194` (force-with-lease sau
khi amend thông điệp cho khớp nội dung, chưa ai dựa vào SHA cũ):

- Gate nói dối: media audit pass xanh khi không có dist. Giờ fail-closed
  (thiếu dist là lỗi rõ lời), ratchet tối thiểu 20 trang build, cross-check
  `src/data/releases.json` khớp tuyệt đối FALLBACK trong main.js (6 self-test).
- Gate mới `config/audit/site-links.py`: link nội bộ đều giải được, anchor
  trong/ngoài trang tồn tại, id DOM duy nhất mỗi trang, sitemap parity hai
  chiều; chạy trong workflow Pages. Bắt ngay lỗi thật: 404 dùng link tương đối
  sẽ gãy ở URL sâu bất kỳ → 404 standalone (CSS inline, link gốc-tuyệt-đối,
  wrangler `not_found_handling`), đã kiểm live trả HTTP 404 đúng trang.
- Khử trùng lặp: 5 trang port bỏ block tải copy tay, dùng DownloadButtons đọc
  `releases.json` duy nhất; FAQ và head chung thành component; landing còn
  đúng 1 `id="download"` (trước 3); canonical là prop tường minh, termCode
  join chuỗi thường chống `${` interpolate.
- Data layer: `catalog.ts` validate từng dòng + ratchet 35 + đủ 8 category
  (mảng assert build.py cũ đã mất được hồi sinh), thay 2 cast trần; tsc vào
  repo typecheck (astro check hỏng dưới pnpm strict layout, ghi lý do).
- Vệ sinh: xóa porter chết, feature-review rời public/ sang docs/verification
  (không còn ship nội bộ ra production), export-previews.py chạy thử lại
  tại vị trí mới cho ra output byte-đối-byte, desktop-audit tách apps/site
  khỏi phạm vi shipped (advisory của Astro không chặn release desktop, cảnh
  báo site-only vẫn in ra), tắt telemetry CI.
- Bằng chứng: repo build/test/typecheck xanh; 3 audit xanh trên build mới;
  screenshot landing 1432161 byte giống hệt trước vá (không đổi gì thị giác);
  Z.AI Vision PASS; live: các trang khớp hash, 404 thật trả 404, 1 nút
  #download duy nhất; Pages + CI xanh.

## Sửa landing theo review của owner (2026-11-12)

- Giữ tiếng Anh mặc định theo D19. Chưa thêm /vi/, chuyển ngôn ngữ hay tự
  chuyển hướng theo trình duyệt. Bản địa hóa đầy đủ vẫn là việc riêng, không
  thêm nút chuyển ngôn ngữ dẫn đến trang chưa tồn tại.
- Hấp thụ: copy ngắn theo công việc của seller, H1 giữ cá tính nhưng H2 và
  các bước chuyển sang chữ thường dễ đọc, nhãn nhỏ chính tăng lên 12px.
  Hero căn giữa, thêm liên kết đến 35 mẫu, editor thật và mã nguồn thay cho
  số người dùng/đánh giá chưa có chứng cứ. Livestream lên sau ảnh sản phẩm.
  Hai cách đổi ưu đãi gộp chung: sửa lớp chữ miễn phí và repaint dùng AI;
  giữ cả hai ví dụ nhìn được không cần JavaScript, không giấu trong tab.
- Bác các đề xuất thiếu chứng cứ: tạo trong một phút, cài trong hai phút,
  giá tiền cố định/banner, số sao/shop minh họa, bảo đảm bao bì không đổi,
  safe zone không bao giờ bị che. Không đánh đồng sửa mẫu với tách chữ ảnh.
  Không đổi MiB thành MB mà giữ nguyên số. Không quảng cáo form API key đã
  bị rút ở D18, không khẳng định AI chạy offline hoặc không cần ChatGPT.
- Điều kiện ChatGPT/hạn mức hiện cạnh CTA. FAQ nói rõ dữ liệu gửi provider,
  chi phí tách chữ, phông xấp xỉ và giới hạn Lens phi thương mại (D23).
  Thông tin nguồn ảnh gom về FAQ, giữ caption ngắn và giới hạn liên quan
  ngay tại ví dụ. Chưa tạo video hay mockup livestream mới; ảnh hiện có
  được giữ nguyên, hero ghi rõ nút chỉ đổi hai đầu ra đã lưu.
- Hai nút tải macOS/Windows vẫn luôn hiện đúng yêu cầu owner trước đó.
  Nhận diện hệ điều hành chỉ đổi độ nhấn, không ẩn nút hoặc đoán CPU;
  mobile/hệ lạ giữ cả hai nút chính, kể cả iPad báo MacIntel.
- Sửa lỗi thật phát hiện trên trang live: DownloadButtons không được truyền
  installHref ở landing, làm Install help thành thẻ a không href. Landing
  nay truyền đường dẫn tương đối; component không vẽ link khi thiếu đích.
  Site-links thêm gate bắt liên kết vô hiệu và regression tái hiện lỗi.
- Gates: site build (21 trang), typecheck, site-links (4 self-test), media
  (6 self-test, 142 tham chiếu), download (4 test, gồm mất mạng/thiếu asset
  và nền tảng chưa xác định) đều xanh; git diff --check sạch. Đã mở xem ảnh
  desktop Chrome thật 1193 × 730. Kiểm tương tác/mobile đang chờ Chrome trả
  quyền điều khiển từ người dùng. Chưa deploy, chưa chạy CI hay Windows
  máy thật; không sửa sản phẩm desktop, không phát sinh lượt AI trả phí.

### Bản ưu tiên thị giác sau phản hồi owner

Owner yêu cầu làm nốt, rồi bác hướng vẫn nhiều chữ: "show don't tell".
Bản này ghi đè cách trình bày ở mục trên:

- Landing EN mặc định, thêm VI tại /vi/ qua cùng Landing.astro, không sao
  chép hai trang; canonical/hreflang EN/VI/x-default và sitemap có đủ. EN/VI
  chuyển tường minh, không tự chuyển hướng hay hiện hộp gợi ý ngôn ngữ.
  Các trang thư viện/hướng dẫn vẫn EN, bản VI ghi rõ khi liên kết sang đó.
- Hero chỉ còn tiêu đề ngắn, một câu giới thiệu, hai nút tải, chi tiết cài
  thu gọn và một dòng ChatGPT. Hai ảnh campaign lớn dẫn thị giác; nút 20/30
  chuyển đầu ra đã lưu, không giả tạo ảnh trực tiếp. Bỏ hàng prompt giả lập,
  phần thương hiệu và quy trình chữ lặp. Nội dung main ở trạng thái mặc định
  đo trong Chrome thật là 173 từ tiếng Anh (không tính chữ trong ảnh).
- Phần còn lại: ảnh sản phẩm → campaign, cặp menu sửa giá, ba mẫu thật,
  screenshot studio lớn, minh họa livestream. FAQ và phần dev đóng mặc định.
  Link fragment đến FAQ/dev tự mở đúng details, gồm tải trực tiếp với hash;
  regression phủ hash sai định dạng và không có đích. Giữ anchor workflow
  cho liên kết từ các trang cũ, dẫn đến ví dụ sửa mẫu; bring ở control hero.
- Tạo video 16 giây từ scene render thật, không phải quay thao tác ứng dụng;
  minh họa livestream dùng preset PNG có alpha thật và ảnh STILL đã có.
  Chạy template-qa Electron trên 35 mẫu, không lỗi hình học; đã mở xem hình
  ghép và poster bằng mắt. Không lấy gate hình học làm chứng cứ thẩm mỹ.
  Video không tiếng, có WebVTT EN/VI, tải theo yêu cầu. Script lặp lại:
  apps/site/scripts/build-walkthrough.py, hash/giới hạn trong
  docs/verification/landing-walkthrough-assets.json. Không tạo ảnh mới,
  không sửa template bundle, không trả thêm quota. Không coi video này
  là demo generation hay bằng chứng tốc độ app.
- QA: Chrome thật desktop 1193 × 730 và mobile 390 × 844, đã mở xem ảnh
  trước/sau. Kiểm nút đổi offer, chuyển EN/VI, FAQ mở từ link chi phí,
  href installer hai nền tảng và không tràn ngang 390px. Kiểm thêm 320px
  phát hiện headline EN thành ba dòng quá cao, đã giảm cỡ chữ mobile.
  Console không lỗi. WebVTT tải đủ bốn cue; MP4 ffprobe đúng 16 giây.
  Playback chưa xác minh được: Chrome background trì hoãn media, play()
  không trả trong hạn; không ghi là đã chạy video. Full-page capture bị
  browser từ chối do tab nền; dùng ảnh viewport từng phần, không lách sang
  browser khác hoặc tự giành focus.
- Gates sau bản rút gọn: build 22 trang, typecheck, site-links (4 self-test),
  media (6 self-test, 160 tham chiếu), 7 test download/landing (đã nối vào
  Pages workflow), diff-check xanh. Không đổi desktop runtime, không kiểm
  Windows máy thật trong vòng này.

### Phát hành và nghiệm thu bản live

- Commit `038a8aa` đẩy main. CI xanh đủ job (run 43182536794, 2m39s, gồm
  desktop smoke); workflow Landing site → GitHub Pages xanh (43182536848).
  Cloudflare Worker twilight-sun-6b7b deploy version b73d909d (30 asset mới,
  58 giữ nguyên), không cần purge cache thủ công.
- Đối chiếu live bằng curl: trang EN là bản mới (có Sale banners/visual-hero,
  không dính cache cũ); MP4 252.845B đúng MIME video/mp4; VTT EN/VI 200
  (text/vtt); livestream-example.webp 200; /vi/ 200; sitemap có đúng 1 mục
  /vi/; URL lạ trả 404 đúng trang.
- Chrome thật trên oia.solutions: console sạch, không tràn ngang 1193px;
  bấm 30% OFF chuyển ảnh (show-p30); mở disclosure video, phần tử video và
  nguồn MP4 tải đúng; hai nút tải giải về asset v0.6.1 đúng cặp tag.
  Playback video trên bản live vẫn chưa xác minh (tab nền trì hoãn media,
  như đã ghi ở vòng local); cần chủ động bấm play khi tiện.

## Thống nhất topbar + blog SEO (2026-11-12, owner yêu cầu)

- Owner báo topbar các trang chưa thống nhất và yêu cầu thêm blog cho SEO.
  Trước đó mỗi trang con tự truyền mảng links riêng (templates có How it
  works/Prompt library/Use cases/GitHub; install, prompts, use-cases mỗi trang
  một bộ) còn landing có nav riêng ba link.
- Nav mới dùng chung `SiteNav.astro` cho mọi trang: brand + Examples ·
  Templates · Blog · FAQ + nút Download accent; landing EN/VI thêm cặp chuyển
  ngôn ngữ (chỉ hai trang này). Page.astro bỏ props links/footerLinks, footer
  dùng một bộ link chung; 7 trang con bỏ mảng riêng. pageNav gióng hệ cao 64px
  như landing, mobile ẩn navlinks đúng ngưỡng 960px như landing từ trước.
- Blog theo đúng kế hoạch README chờ duyệt: content collection
  `src/content/blog` + `content.config.ts`, trang danh sách và bài viết tại
  /blog/, mỗi bài có canonical, og, JSON-LD BlogPosting, CTA tải. Ba bài đầu
  viết bám sự thật sản phẩm (đổi giá ba đường với chi phí thật, overlay
  livestream + giới hạn vùng an toàn, checklist Tết), liên kết nội bộ tới
  templates/use-cases/prompts/install. Không bịa số liệu nền tảng; ảnh bài
  viết dùng asset có sẵn qua thẻ img thường (cú pháp markdown ảnh bị Astro
  optimizer trỏ ra ngoài public/).
- Gate mới trong landing-surface.test: mọi trang build (trừ 404) phải có
  đúng nav chung (siteNav + đủ Templates/Blog/#product/#faq/#download, nút
  Download/Tải ứng dụng), language-switch chỉ được xuất hiện ở cặp landing;
  blog post phải có canonical + BlogPosting + nút tải + main.js, và nằm trong
  sitemap. Lỗi thật bắt được khi dựng: id=download trùng trên landing (section
  CTA + anchorId nút hero) và trang danh sách blog thiếu khối #download cho
  anchor nav; cả hai đã sửa.
- Gates: build 26 trang, typecheck, site-links (kể cả sitemap parity 4 URL blog mới), media audit 167 tham chiếu,
  9 test download/landing xanh. Chrome thật kiểm /, /vi/, /templates/, /blog/,
  bài Tết: nav 64px sticky/fixed đúng chỗ,\n  link relative đúng base từng tầng, JSON-LD đúng loại, ảnh bài tải thật,\n  console sạch, không tràn ngang ở 1193px lẫn 390px (navlinks ẩn). Ảnh chụp thu được nhưng phiên agent không tự mở được; kết luận nav/blog dựa
  số đo DOM thật, không phải kiểm thị giác bằng mắt.
- Còn mở: bài viết tiếng Việt (nợ ghi README), RSS, và owner chưa tự xem mắt bản mới.
  Chưa deploy lúc ghi mục này; phát hành và nghiệm live ghi ở mục sau.

### Phát hành vòng nav + blog

- Commit `0c1311c` (nav + blog) và `385e432` (vá CI) đẩy main. Lần CI ĐẦU
  ĐỎ đúng lỗi thật: job unit-windows chạy turbo typecheck trên checkout
  sạch, `content.config.ts` import `astro:content` mà thư mục `.astro`
  (gitignored) chưa được sinh → TS2307. Vá: script `pretypecheck: astro
  sync` trong apps/site; nghiệm cục bộ bằng xóa `.astro` rồi typecheck
  nguội. CI chạy lại XANH (run 43187019641), workflow Pages xanh.
- Cloudflare worker deploy version 51925df1. Đối chiếu live bằng curl: đủ
  loại trang (/, /vi/, /templates/, /blog/, bài viết, /prompts/) đều mang
  `siteNav` + `href="#download"`; `language-switch` chỉ ở cặp landing;
  bài viết có canonical + JSON-LD BlogPosting; sitemap chứa 4 URL blog.
- Không đổi desktop runtime; không lượt AI trả phí trong vòng này.

## Rút chữ các trang con theo hướng "show don't tell" (2026-11-12, owner yêu cầu)

- Owner duyệt landing ít chữ nhưng báo các trang khác vẫn nhiều chữ. Đo mốc
  bằng đếm từ hiển thị (loại nav/footer và nội dung details đóng, cùng parser
  cho hai bản) trước/sau: install 442→218 (−50%), flash-sale 297→163 (−45%),
  livestream-overlays 279→152 (−45%), presentations 292→163 (−44%),
  templates 722→677 (−6%), prompts 782→755 (−3%).
- Cách làm: lede mỗi trang còn một câu; bước 4 bước mỗi bước một dòng; 4 thẻ
  giải thích mỗi trang use-case đổi thành dải chip dữ kiện (factRow, mono một
  dòng); install rút về mệnh lệnh ngắn, giữ nguyên lệnh xattr và checksum.
  Trang livestream-overlays và presentations thêm ảnh dẫn đầu (preset thật
  ghép minh họa / template deck thật) kèm chú thích nguồn; trang templates
  bỏ catNote, rút lede; TemplateFaq đổi heading "Good to know" (nội dung
  vẫn là details đóng, JSON-LD FAQ giữ nguyên).
- templates/prompts giảm ít là chủ đích: chữ còn lại là nhãn trên bộ 35 ảnh
  (tên + kiểu mẫu) và thân thư viện prompt copy-paste, đó là sản phẩm đang
  show, không phải văn giải thích. Không cắt bớt prompt hay nhãn mẫu.
- meta description/title các trang giữ nguyên cho SEO; chỉ rút chữ hiển thị.
- Gates: build 26 trang, typecheck, site-links, media 169 tham chiếu, 9 test
  download/landing xanh. Chrome thật: 4 trang use-case/install chụp ảnh,
  console sạch; DOM khẳng định ảnh mới tải thật (900px/1600px), chip
  4-5 phần tử, 4 bước, không tràn ngang 1193px. Phiên này không mở được
  ảnh chụp bằng mắt; emulate mobile hai lần bị observation churn từ
  IntersectionObserver nên mobile của chính các trang này chưa đo lại, các
  khối dùng lại stylesheet đã kiểm mobile vòng trước (flex-wrap).
- Còn mở: owner chưa tự soi mắt; chưa deploy lúc ghi (phát hành ghi ở mục
  sau nếu có).

- Phát hành vòng này: commit `777774f`, CI + Pages workflow xanh (run
  43188957659 / 43188957649), worker deploy d90ce109. Đối chiếu live: số từ
  hiển thị khớp dist (install 218, livestream 152, presentations 163,
  flash-sale 163), ảnh livestream-example và factRow có mặt trên bản live.

## Song ngữ toàn site: cây /vi/ đầy đủ (2026-11-12, owner "Sửa cả tiếng việt cả tiếng anh r chứ")

- Owner duyệt hướng show-don't-tell nhưng yêu cầu làm cả hai ngôn ngữ: trước
  đó chỉ có landing VI, các trang con vẫn EN và landing VI phải gắn nhãn (EN).
- Kiến trúc: mọi trang con chuyển thành component dùng chung trong
  components/pages (locale + base props), file route EN và VI cùng mount;
  Landing.astro tách base (asset theo gốc site) và content (theo cây /vi/).
  Trang VI tính vbase (path về /vi/) cho link anh em, base cho asset/style.
  SiteNav nhận href đã giải, xuất hiện ở mọi trang kèm cặp EN/VI trỏ đúng
  trang tương ứng; Page.astro nhận locale/route, phát lang, canonical, cặp
  hreflang en/vi/x-default và og:locale.
- Phạm vi dịch: templates index + 13 trang mục (nhãn nhóm/pack VI qua
  locale-labels.ts, tên mẫu giữ nguyên vì là tên sản phẩm), prompts (phần
  bao quanh dịch; thân prompt giữ tiếng Anh kèm ghi chú vì nhãn tested đã
  kiểm chứng với nguyên văn đó), install, 3 use-case, blog (collection
  blog-vi riêng, 3 bài dịch đầy đủ cùng slug). Sitemap thêm 23 URL VI;
  tổng 49 trang.
- Gate cập nhật: landing-surface giờ yêu cầu mọi trang có nav chung đúng
  nhãn theo ngôn ngữ + cặp switch giải tới trang thật (URL resolve), và test
  mới "cây VI đối xứng cây EN" (mọi trang nội dung phải tồn tại ở cả hai
  cây, mọi trang có đủ hreflang). Sửa lỗi thật khi dựng: PromptsPage còn
  thẻ Page cũ lồng nhau sau phẫu thuật chuỗi; BlogPostPage thiếu </main>
  (lỗi cũ cả bản EN, giờ cả hai đều có main) và thiếu is:inline cho script
  JSON-LD trong component; VI parity test bắt "/" dư do map landing.
- Kiểm chứng: build 49 trang, typecheck, site-links (sitemap parity hai
  chiều), media 296 tham chiếu, 10 test download/landing xanh. Kiểm Python
  trên dist cho 11 trang VI đại diện: lang=vi, nav VI, CTA "Tải ứng dụng",
  0 ảnh thiếu, canonical/hreflang đúng, BlogPosting có mặt cả hai ngôn ngữ.
  Số từ main VI: use-case 178-215, install 216, blog list 204 (VI dài hơn EN
  ~15-20% là tự nhiên). Ảnh chụp Chrome thu 2 file nhưng không mở xem được
  bằng mắt trong phiên; phiên bsk hôm sau kẹt observation liên tục nên QA
  DOM chạy bằng Python deterministic thay evaluate; gate switch đã kiểm đích
  đến theo URL resolve thật.
- Còn mở: owner chưa tự soi mắt bản VI; nền tảng semantic (deck/overlay)
  giữ thuật ngữ quốc tế; nhãn "Copy prompt" trên trang VI chưa dịch (script
  reset theo nguyên văn); chưa deploy lúc ghi mục này.

- Phát hành: commit `1d862b5`, CI xanh (43193508235, gồm desktop smoke),
  Pages xanh, worker deploy 19b82b83. Live: 7 trang VI mẫu trả 200;
  /vi/templates/ có lang=vi, canonical VI, cặp hreflang en/vi/x-default đúng
  đích; sitemap chứa 24 URL VI. Không đổi desktop runtime, không tốn lượt AI.
