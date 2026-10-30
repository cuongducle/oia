# Kế hoạch chốt: desktop-only, bỏ web

**Ngày chốt:** 2026-10-30 (sau phiên review toàn diện + tham chiếu `stablyai/orca`)
**Sửa lần 2:** 2026-10-30 — hấp thụ review ngoài (11 điểm: 3 Critical, 4 High, 4 Medium/Low); owner chốt UI tiếng Anh.
**Trạng thái:** quyết định của chủ sở hữu — đây là bản ghi thực thi.

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | Desktop (Electron) là sản phẩm DUY NHẤT. Web app sunset sau khi port xong. |
| D2 | Bỏ hết cái thừa: `apps/web`, `packages/db` (code chết), Redis CI, BullMQ. **GIỮ `packages/skills`** — xem D9. (`apps/worker`, `docker/` đã xóa ở bước 3.) |
| D3 | Tổ chức cho macOS + Windows. Gate: build macOS pass KHÔNG phải bằng chứng cho Windows — phải kiểm trên máy Windows thật. |
| D4 | Brand Kit: port panel tối giản sang desktop (dữ liệu đã có trong `tasks/brandkits.ts`, planner đã đọc qua `services/context.ts`). |
| D5 | Toolbox: GIỮ TOÀN BỘ 13 tool + Background Remover. PPT Translator hiện là landing — xếp implement hậu kỳ, không chặn v1. |
| D6 | Không tạo `packages/studio` / `packages/desktop-contract` — chỉ còn 1 consumer (YAGNI), UI ở `apps/desktop`, hợp đồng IPC ở `src/shared`. |
| D7 | Mượn từ Orca 3 thứ: baseline ratchet (nợ đo bằng số, chỉ được giảm), process-host pattern cho CliRuntime Windows, knip dò code chết. Không copy `cloud/`, `mobile/`, `Casks/`. |
| D8 | **CHỐT CUỐI (owner, 2026-10-30): desktop UI ship bằng TIẾNG ANH.** Tiếng Việt chỉ ở mức nội dung banner (font Be Vietnam Pro). Ghi đè G7 của Stage 0 ("plain-Vietnamese messages") ở khối UI; provider-errors map class→key, bản EN trong `renderer/lib/errors.ts`. `i18n.ts` đã copy sẽ TRIM về en-only (chỉ dùng làm nguồn I18nKey) — làm ở bước 4. Lý do ghi nhận: owner quyết định sản phẩm; mâu thuẫn với persona seller Việt đã cân nhắc và chấp nhận. |
| D9 | GIỮ `packages/skills` + loopback agent API trong desktop main — bind 127.0.0.1, tái dùng ServiceContext (taskStore, apiKeyStore, fileStore). **Spec bảo mật/vận hành đầy đủ** (xem mục "Loopback API spec" riêng). |
| D10 | **Quan hệ với Stage 0 (hấp thụ review điểm 1):** engine của banner loop ĐÃ shipped + test (TP.2 CodexLlmProvider `llm/codex.ts`; TP.3 clean-plate trong schema/designer; blocks[] qua `copy-zones.ts`; TP.9 reference `-i` qua bridge; TP.4/5/7/8 ở providers/tasks/canvas). Vì vậy plan này không lặp lại chúng. Rationale "chứng minh loop trên web trước khi đóng gói" của Stage 0 **BỊ GHI ĐÈ** bởi quyết định desktop-only của owner (desktop đã có code, web transitional). Hai di sản Stage 0 vẫn sống: (a) **buổi validation với seller thật chưa chạy** — chuyển thành gate ở bước 7 trước khi phát hành rộng; (b) roadmap step 2 (persistence hardening) được kéo vào thành điều kiện tiên quyết v1 — xem bước 5. Doc `banner-maker-loop-stage-0.md` đánh dấu superseded-in-parts (đã gắn banner ở đầu file). |
| D11 | **Utility process ngay ở bước 4 (review điểm 4, phương án B):** services (taskStore, runChat, loopback server, spawn CLI) chuyển vào 1 `utilityProcess`; main chỉ giữ window/menu/IPC/dialog/updater. Lý do: loopback API + tools đang được thiết kế contract mới — chuyển sau sẽ đắt hơn; crash cô lập; main block = treo cả app. |
| D12 | **GHI ĐÈ T3 (owner, 2026-11-06): codex ĐÓNG KÈM app, pin theo cặp phiên bản.** Sau khi đối chiếu 5 dự án OSS làm agent (openai/codex SDK TS+Python, block/goose, sst/opencode, cline/cline): 4/5 đóng binary vào app hoặc cài kèm theo nền tảng; riêng OpenAI SDK pin "exact compatible binary" — binary + client là một cặp được test cùng nhau. T3 (không pin, chạy `releases/latest`) chỉ còn đúng cho nút Install trong Runtime Panel (dev/unpackaged, không có binary đóng kèm). Cơ chế: `resources/codex-pin.json` pin tag → `pnpm --filter @oia/desktop fetch-codex` tải release checksummed vào `apps/desktop/resources/codex/` (gitignored, build artifact) → bước 7 electron-builder extraResources chép vào `Contents/Resources/codex` (Windows: `resources/codex`). Thứ tự detect mới: CODEX_BIN env → **bundled** → PATH+well-known → managed. Lợi: mở từ Dock/Finder chạy ngay không cần setup (GUI app không thấy shell PATH), hết họ lỗi "release codex mới gãy đồng loạt". Chi phí: ~166 MB archive / ~407 MB giải nén mỗi nền tảng + cập nhật codex phải qua build app (đổi lại được test cặp). **Pin rust-v0.166.0 đã nghiệm đúng nghi thức trên: DESKTOP_REAL_SMOKE OK (2026-10-30, version=0.166.0, assetBytes=1942938, 40 giây, không lỗi) — một generation thật chạy qua binary đóng kèm. Luật từ nay: bump pin ⇒ REAL_SMOKE phải pass qua binary mới trước khi ghi "tested pair" (chạm quota, owner duyệt).** Còn treo cho sau này (KHÔNG chặn v1): codex có `app-server` (daemon WebSocket + schema TypeScript cho client nhúng) — bề mặt được thiết kế chính cho app như Oia, thay thế spawn CLI `--json` (bề mặt không cam kết — rủi ro T3 còn lại) khi chi phí chuyển đổi đáng. Nguồn: zread.ai/openai/codex (18-python-sdk, 19-typescript-sdk), zread.ai/block/goose (25-desktop-ui-architecture), zread.ai/sst/opencode (18-desktop-application), zread.ai/cline/cline (26-desktop-app-architecture). |
| D13 | **(owner, 2026-11-06): cài mới mặc định `auto` + consent ĐÃ ĐỒNG Ý** — zero-config cho chế độ thật: máy nào đang có codex CLI + ChatGPT login sẵn sẽ chạy codex ngay lần mở đầu tiên, không cần click nào. Ghi đè mặc định consent=false của TP-D3 (resolver không đổi — vẫn cần runtime `ready`); rủi ro được owner chấp nhận và ghi nhận: một máy lạ có codex đã login sẽ đốt quota ngay từ launch đầu. Vẫn được bảo vệ bất kể consent: không có binary / chưa login → mock; CI smoke/shot ghim mock bằng env; `codexConsent: false` tường minh vẫn được tôn trọng (opt-out ở lại là opt-out). Default sống ở hàm thuần `normalizeProvidersSettings` (shared/providers-mode.ts) + test ghim ở desktop.test.ts. |

## Loopback API spec (D9 — đầy đủ, hấp thụ review điểm 3)

- **Transport**: `node:http`, bind **chỉ 127.0.0.1**. **Port random** + ghi **discovery file** `<userData>/agent-api.json` (quyền 0600) chứa `{port, pid}`; xoá file khi tắt. Skill script: đọc discovery file trước, `OIA_BASE_URL` override sau.
- **Chống DNS rebinding / browser**: validate `Host` header == `127.0.0.1:<port>`; **từ chối mọi request có `Origin` header**; KHÔNG bao giờ trả `Access-Control-Allow-Origin`. Key chỉ nhận qua `Authorization` header, không qua query string.
- **Auth**: API key BẮT BUỘC mọi route. `apiKeyStore` đã hash sha256 — giữ nguyên; plaintext chỉ hiển thị 1 lần khi tạo (panel For Agents: tạo/xem preview/thu hồi).
- **Routes**: `POST /api/tasks/{type}` submit, `GET /api/tasks/{id}` poll, `POST /api/tasks/cancel`, `POST /api/upload/direct`, **`GET /api/files/{key}` (có auth)** — vì `oia://files` chỉ dùng được trong Electron; agent ngoài fetch qua HTTP loopback này.
- **Quota bảo vệ**: giới hạn concurrency **mỗi provider** (Codex = 1 job chạy đồng thời) + rate limit mỗi key; job do agent tạo **hiển thị trong UI desktop** (nhãn "agent") để owner thấy ai đốt quota.
- **Giới hạn upload** (max body size, ví dụ 50 MB — chốt khi implement). **Khi app đóng**: server tắt, agent nhận `ECONNREFUSED` — ghi rõ trong SKILL.md.
- Envelope `{code, data, msg}` + TTL 24h giữ nguyên → 15 skill không sửa logic.

## Cây thư mục đích

```text
oia/
├── package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├── .env.example               # chỉ còn provider (CODEX_*, OPENAI_*, FAL_*) — infra chết đã dọn ở bước 3
├── config/                    # (tối giản — học Orca nhưng không nhân bản)
│   ├── knip.json              # dò code chết (đã tận dụng 1 lần với packages/db)
│   └── baselines/             # ratchet: số nợ chỉ được GIẢM. Hiện 1 metric
│       └── oia-web-imports.baseline.txt   # = 0 (khởi tạo 5 ở bước 2, về 0 ngay)
│                              # metric mới (any, @ts-ignore, TODO) thêm khi nợ xuất hiện
│
├── apps/
│   └── desktop/               # shell duy nhất
│       ├── src/
│       │   ├── main/          # index, runtime + (mới) updater, rembg integration
│       │   │                  #   — KHÔNG còn chứa services (D11: sang utility process)
│       │   ├── utility/       # (mới, D11) node task entry: ServiceContext,
│       │   │                  #   runChat, loopback API server, spawn CLI
│       │   ├── preload/       # contextBridge hẹp, zod-validate
│       │   ├── renderer/
│       │   │   ├── views/     # Home, Editor, Workspace (đã có) + Tools.tsx, BrandKit.tsx
│       │   │   ├── components/# + ToolRunner, BrandKitForm, ForAgentsPanel
│       │   │   ├── lib/       # tools-registry, studio-templates, studio-ui,
│       │   │   │              #   provider-errors, i18n (TRIM en-only — D8)
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
| `docker/`, Redis CI, `bullmq`, `ioredis` | Chỉ phục vụ worker — ĐÃ XÓA ở bước 3 |
| Share link `p/[id]` (web) | Tính năng server; desktop thay bằng export file trực tiếp — không có nhu cầu link công khai khi không có host |
| UI skills/docs trên web | Trang web tĩnh; `packages/skills` GIỮ theo D9 |

## Phát hiện review quan trọng (không được quên)

- **B2 — CHẶN (đã xử lý ở bước 2):** desktop từng import `@oia-web/libs` ở 5 chỗ — xóa web trước khi cắt là gãy build.
- Windows path parsing Codex ĐÃ sửa (`parseImagePathHint` đủ POSIX/`C:\`/`C:/`; `provision.ts` biết `.cmd/.exe/.bat`) — còn thiếu gate máy thật.
- `services`/`tasks` sạch Next.js — chuyển IPC an toàn.
- Desktop đã có `files:upload` IPC + `oia://files` protocol — nền tool port đã sẵn.
- Editor desktop 988 dòng ≥ web 890 — port đã dày, chỉ cần checklist parity.
- rembg: pip đặt `rembg.exe`, spawn `.exe` trực tiếp được; rủi ro PATH GUI ≠ terminal — đã có error hướng dẫn. **Bundle rembg quyết CÙNG signing ở bước 7** (binary kèm app đều phải ký khi notarize; model ONNX + Python runtime có thể nặng hàng trăm MB).
- **PATH macOS từ GUI (review điểm 5):** mở từ Finder/Dock không kế thừa shell PATH — codex qua nvm/Homebrew sẽ không thấy. Cần resolve login-shell env (shell-env pattern) hoặc dựa vào managed install của runtime panel.

## Checklist thực thi (thứ tự bắt buộc)

**Bước 1 — Quick wins schema** ✅ XONG (2026-10-30, commit `b5d383a`)
- `SCENE_VERSION` hằng số trong `@oia/schema`, thay 5 chỗ `"7.3.1"`. `OIA_SCHEMA_VERSION` riêng của Oia (bước 1 đặt = 1). Đồng bộ Fabric 6.9.1 toàn repo.
- Gate: `pnpm build && pnpm test` xanh. ✅

**Bước 2 — Cắt phụ thuộc @oia-web (CHẶN)** ✅ XONG (2026-10-30, commit `cfae314`)
- 4 file libs copy vào `renderer/lib/`; bỏ alias `@oia-web`; baseline ratchet = 0 + CI guard.
- Gate: grep 0, typecheck/build, 22 test, smoke Electron thật (`DESKTOP_SMOKE OK`). ✅

**Bước 3 — BullMQ purge** ✅ XONG (2026-10-30, commit `9f85daa`; `apps/worker` + `docker/` xóa sớm vì worker phụ thuộc BullMQ)
- Queue in-process thuần; bỏ deps bullmq/ioredis; CI bỏ Redis; `.env.example` dọn infra chết.
- Gate: 28 task test+typecheck xanh không Redis; smoke OK. ✅

**Bước 4 — Port Tools + BrandKit + Loopback API + Utility process (D9, D11)**
- **4a. Utility process** ✅ XONG (2026-10-30): ServiceContext/runChat/taskStore vào `src/utility/`; RPC có rid + chat event routing về đúng WebContents; renderer contract không đổi; crash services không giết window. Gate: smoke events=9 + SHOT full qua utility thật.
- **4b. Loopback API** ✅ XONG (2026-10-30): server `node:http` trong utility, bind 127.0.0.1, port random + discovery file 0600; Host validation + chặn Origin + không CORS + key chỉ qua header; `/api/files/{key}` có auth; rate limit 20 submit/5 phút/key; codex guard 1 job; agentJob events; 9 test e2e loopback (security gates + envelope + upload multipart + poll 404). Skill scripts: tự đọc discovery file khi thiếu OIA_BASE_URL (check pid sống, skip file stale); sửa bug lộ ra: generate-poster schema không nhận `language` (script gửi thừa từ trước). Gate e2e thật: skill script chạy → discovery → auth → mock generation → download 200/401 đúng.
- **4c. Tools view** ✅ XONG (2026-11-06): `views/Tools.tsx` + `components/ToolRunner.tsx`; `lib/tools-registry.ts` copy từ web (desktop sở hữu bản sao). 4 đường fetch → IPC: upload→`uploadAsset`, tasks submit/poll→`submitTask`/`getTask`/`cancelTask` (noWait:false + poll 2s — không treo RPC 30s trên generation 1–6 phút), projects→`createProject`; download anchor→`saveExport` (dialog native). G3 guard cho lane IPC trích xuất thành `utility/guardedTaskSubmit.ts` dùng CHUNG với loopback (reserve đồng bộ + settle exactly-once + fallback TTL + dispose) — loopback refactor sang dùng chung, 9 test e2e loopback xanh xác nhận hành vi giữ nguyên. Deps mới: heic2any, pdfjs-dist (worker emit asset tương đối — sống dưới file://), tesseract.js (CDN lần đầu như web). Sửa kèm bug schema: `logos` của brandkit chỉ nhận URL tuyệt đối → logo upload qua app (/api/files/…) bị từ chối ngầm từ thời web; `LOGO_REF` giờ chấp nhận cả hai dạng (regression test ở tasks + schema IPC test).
- **4d. BrandKit panel + For Agents** ✅ XONG (2026-11-06): `views/BrandKit.tsx` (list + form guidance/colors/fonts/logos + Default toggle + Delete; logo upload qua `uploadAsset`; "Design with this kit" = kích hoạt applyByDefault + về Home) qua IPC mới `brandKits.*`; hiệu lực qua `ctx.brandKits.active()` sẵn có của runChat. `views/ForAgents.tsx`: keys tạo/xem/thu hồi (plaintext hiện 1 lần; `keys.list` chỉ metadata), Base URL từ port loopback live (`loopback.port` — port đổi mỗi fork), agent-job feed (main ring buffer 50 frame + stream `agentJob:event`; job của Tools UI KHÔNG hiện — không phải agent job). Nav: Home / Workspace / Tools / Brand kit / For agents.
- **4e. Trim `i18n.ts` desktop về en-only** ✅ XONG (2026-10-30): 221 dòng → 64 dòng, chỉ còn EN dict + `I18nKey` union nguyên vẹn (53 key).
- **4f. Job durability** ✅ XONG (2026-10-30): TaskStore.load() đánh dấu mọi record kẹt "processing" từ lần chạy trước thành `failed` + taskNote "interrupted by app restart", có persist (boot thứ 2 đọc cùng trạng thái). Test mới trong store.test.ts.
- Gate: tool local + tool AI (mock pair) end-to-end ✅ (shot chạy YouTube Banner Maker qua bridge thật: submitTask→poll→ảnh oia:// vẽ lên; tool convert là port nguyên văn pipeline canvas của web — không đổi logic); brandkit lưu → generation nhận guidance ✅ (`test/brandkit-wiring.test.ts`: kit active + brandKitId explicit đều tới message planner); curl qua loopback với key → poll → download ✅ (gate 4b, chạy lại cùng bộ); **smoke Windows thật (CI windows-latest, mock pair)** — job `desktop-smoke-windows` thêm vào CI; lần chạy ĐẦU ĐỎ: gate discovery-file 0600 trong loopback.test mang giả định POSIX (fs mode là no-op trên Windows — stat luôn báo 0666) → đã sửa theo hướng thật: loopback áp ACL `icacls /inheritance:r` chỉ giữ user hiện hành, test đổi sang assert ACL trên Windows / mode 0600 trên POSIX (bài học ghi vào cross-platform-support.md); trạng thái CI cuối: XANH (run 41042826769, 2026-10-30 — cả 3 job; windows-latest chạy thật đủ bộ smoke/crash/SI Electron: `DESKTOP_SMOKE OK events=9`, `DESKTOP_CRASH_SMOKE OK`, `DESKTOP_SI_SMOKE OK secondaryExited=true marker=true`). Smoke macOS mở từ Dock (không terminal) tìm được codex — PHẦN DETECT ĐÃ NGHIỆM bằng D12: mô phỏng GUI launch (PATH cắt về `/usr/bin:/bin:/usr/sbin:/sbin`) → `detect: source=bundled`, binary chạy `codex-cli 0.166.0`; còn lại chờ bản đóng gói bước 7 (extraResources) + login/generation thật trên máy owner (mock pair xanh trên macOS qua smoke/crash/shot). Gates chạy cục bộ 2026-11-06 (vòng 1 + vòng sửa self-review): build/test/typecheck toàn repo xanh, smoke OK events=9, crash-smoke OK, shot xanh mọi view + tool AI + gate clipboard mới, desktop-audit OK.

**Hậu kiểm self-review vòng 2 (2026-11-06, sau khi port 4c/4d):** 8 sửa từ tự rà: (1) clipboard renderer bị permission deny-all chặn (thực nghiệm Electron thật xác nhận) → copy đi qua IPC main + phản hồi "Copied" thấy được + gate shot; (2) poll loop ToolRunner rò khi rời view → aliveRef dừng poll, task vẫn chạy (B7) và hiện ở feed Runs; (3) succeeded-thiếu-download từng trả chuỗi rỗng → giờ là error; (4) heuristic bắt lỗi save BrandKit viết ngược (che chi tiết validate) → trích đoạn lỗi thật; (5) feed For Agents gộp theo taskId (event sync-mode tới sai thứ tự) + dán lane agent/tool — lane tool trả lại visibility cho generation chạy từ Tools (hard rule 6); (6) port loopback 3 trạng thái thay vì "starting…" mãi mãi; (7) `lastUsedAt` được persist (UI hiển thị nó — record không được nói dối); (8) LOGO_REF cấm dot-dot, guard emit-safe (sink ném lỗi không phá kế toán slot), bỏ cast `as TaskType`, gộp 3 kiểu frame về AgentJobFrame, test guard deterministic (ctx riêng mỗi test + barrier terminal-event), nav wrap.

**Bước 5 — Editor parity + persistence hardening + cứu test (điều kiện tiên quyết v1 — review điểm 9)** ✅ XONG (2026-11-06, gồm gate owner — xem cuối mục)
- **Persistence hardening:** `ProjectStore` chuyển sang **per-project files** (`dataDir/projects/<id>.json`) — một file hỏng chỉ mất ĐÚNG project đó (quarantine từng file, bytes giữ nguyên), thay vì cả kho trong `projects.json` nguyên khối. Legacy monolith được hấp thụ tự động khi load: mỗi entry thành file riêng, file gốc đổi tên `projects.json.legacy-<ts>` (không bao giờ xoá), id không an toàn làm tên file được cấp lại; file per-project thắng khi trùng id (mới hơn theo cấu trúc). Bất biến one-file-one-project: file sai tên/id bị cách ly chống trùng lặp.
- **Migration runner theo schemaVersion** (`projectMigrations.ts`): chuỗi bước `from→to` chạy từ `schemaVersion ?? 0`; bước thật đầu tiên `v0→v1` = trích base64 vào asset store (đúng format legacy web). Load chạy read-tolerant (bước fail → project vẫn mở, chưa stamp); save vẫn strict (PersistenceError như cũ); store tự viết lại một lần sau khi migrate thành công (boot sau đó no-op). Project từ tương lai (schemaVersion cao hơn) không bị hạ cấp.
- **Import `.data` web** (`importWebData.ts` + lane UI): chọn folder trong Workspace → copy assets NGUYÊN KEY (các lane legacy md5/sha256 của hydrate() giữ cho mọi ref `/api/files/<key>` cũ còn chạy) → merge projects (chạy migration chain) + chat sessions (remap id số, dedup theo fingerprint — idempotent) + brand kits (pick đúng keys schema vì brandKitSchema strict với metadata web) + templates. **Hai pha: validate hết nguồn TRƯỚC khi đụng store** — nguồn hỏng abort sạch, không nửa vời; nguồn là READ-ONLY tuyệt đối (bản duy nhất của owner); desktop thắng khi trùng id; chạy lại lần 2 = no-op. `api-keys.json` KHÔNG import (quyết định: credential máy-cục-bộ). Wire: `data.importWeb` (utility) ← `data:importWeb` IPC ← bridge `importWebData("")` (chuỗi rỗng = mở folder picker native).
- **Checklist parity editor web↔desktop:** [`docs/verification/editor-parity.md`](../verification/editor-parity.md) — desktop ⊇ web (7/7 panel, pages, layers, text, AI dock, export 5 định dạng, undo/redo, autosave, publish template); desktop vượt ở reference-image dock, text color/font-size, template library. Không tính năng web nào thiếu.
- **Ma trận coverage:** [`docs/verification/web-test-coverage-matrix.md`](../verification/web-test-coverage-matrix.md) — 12 file test web map đủ sang thay thế. 3 ô trống ĐÃ PORT: `renderer-libs.test.ts` (studio-ui sceneSize/fitArtboard/category/imageSource, studio-templates chất lượng, tools-registry 4 category + đúng 1 landing ppt-translator, i18n EN sạch + gate EN-đủ-cho-mọi-errorClass, scan không dấu Việt toàn renderer) và `provider-status.test.ts` (capabilities + isMock + quota của providerStatusSnapshot — chưa từng có test trực tiếp). 2 hành vi kết thúc CÙNG web có chủ đích: share link `p/[id]` (D2) và skills-registry sync (artifact của trang docs web; packages/skills sống theo D9, consumer thật là loopback e2e).
- **Phát hiện + sửa khi dựng ma trận:** (1) dict "en" của `i18n.ts` còn 26 chuỗi tiếng Việt (di sản Stage 0 bị D8 ghi đè; chưa render vì không view nào gọi t() nhưng tự mâu thuẫn D8) → dịch hết, giữ nguyên key (không đổi wire), export `EN_MESSAGES` làm nguồn gate; (2) EN dict của `errors.ts` là `Partial` với fallback câm → gate mới mọi class phải render đúng bản EN của chính nó; (3) comment stale "plain-Vietnamese" ở provider-errors.ts sửa theo D8.
- **Gate:** parity tick hết ✅; ma trận không ô trống ✅; persistence: tạo project → kill utility giữa chừng → refork → **project sống sót** (crash-smoke nâng cấp: before=1 recovered=1, đúng tên project — không chỉ chứng minh wiring); store-level: reopen round-trip + blast-radius (1 file corrupt không giết hàng xóm) + absorb idempotent; import: 9 test mới (happy lane, reopen sau import, idempotent, desktop-wins, nguồn corrupt abort + nguồn không bị đụng, entry invalid skip đếm đúng); `pnpm build && pnpm test && pnpm typecheck` xanh (tasks 99, desktop 80, services 19), DESKTOP_SMOKE OK events=9.
- **Gate owner ĐÃ CHẠY (2026-11-06, agent chủ trì qua computer-use trên máy thật):** mở app thật → Workspace → nút "Import from web app" → folder picker native (⌘⇧G → chọn folder) → import chạy → notice **"Nothing new to import — everything was already here."** hiện đúng. Nguồn là bản copy byte-to-byte dữ liệu thật của owner (33 project từ chính monolith legacy mà migration đã hấp thụ + 80 sessions + files thật) — vì store desktop ĐÃ chứa toàn bộ dữ liệu này (migration per-project file đã chạy trên dữ liệu thật lúc mở app: 35 cards hiện trong Workspace). Kết quả đo được: lane UI→IPC→utility chạy đủ, idempotent trên dữ liệu thật đúng nghĩa (mọi thứ đã có → all-skip, counts không đổi 35/80, nguồn không bị đụng). Phạm vi claim thẳng thắn: đường "import dữ liệu CHƯA có" được chứng minh bằng 9 test fixture (vì dữ liệu thật đã nằm trong store từ trước — không còn gì ngoài store để import); Home hiển thị "Codex is ready · 0.166.0 · ChatGPT · bundled" (D12/D13 sống trên máy thật). UX note: notice là state của view Workspace — rời view rồi quay lại sẽ mất (chấp nhận, không phải lỗi dữ liệu).

**Bước 6 — Xóa 1 lượt**
- Xóa: `apps/web`, `packages/db`, `docs/private/ui-audit`. (`apps/worker`, `docker/` đã xóa; `packages/skills` GIỮ theo D9.)
- Viết lại README (quick start desktop + loopback API cho agent). Gắn banner superseded cho Stage 0 doc (xong cùng bản này).
- Gate: `pnpm build && pnpm typecheck && pnpm test` toàn repo xanh SAU khi xóa.

**Bước 7 — Đóng gói đa nền tảng + bảo mật + phát hành**
- `electron-builder.yml`: mac arm64 + x64 (hoặc universal), win x64 NSIS; `resources/` icons.
- **D12 — extraResources cho codex đóng kèm:** build trước bằng `pnpm --filter @oia/desktop fetch-codex -- --platform <target> --arch <target>` (mỗi target build trên CI tương ứng hoặc truyền chéo), electron-builder chép `resources/codex` → `Contents/Resources/codex` (mac) / `resources/codex` (win); detect đã sẵn nguồn `bundled` (xem D12). CI cần cache download theo tag để không tải 166 MB mỗi build.
- **Updater implement thật (review điểm 6):** electron-updater + kênh cập nhật; auto-update macOS CHỈ hoạt động khi app đã ký.
- **Kế hoạch KHÔNG ngân sách signing (ghi rõ để không bí):** build nội bộ không ký, hướng dẫn bypass Gatekeeper (macOS) + chấp nhận cảnh báo SmartScreen (Windows), KHÔNG auto-update, phân phối qua release GitHub. Khi có ngân sách: Apple Developer ID + notarization, cert Windows (hoặc SignPath), bật updater.
- **Checklist bảo mật Electron thành gate (review điểm 8):** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP, `setWindowOpenHandler` + chặn navigation, **path-traversal test cho `oia://files`** (từ chối `..`, absolute path, symlink thoát root).
- CliRuntime mạnh theo process-host: `windows-cmd-shim-resolution`, tree-kill + test riêng; resolve login-shell PATH cho macOS GUI launch.
- CI matrix: typecheck/test/build trên macos + windows + ubuntu; giữ `desktop-smoke` xvfb Linux; upload artifact mac/win thật.
- **Gate phát hành (D10):** buổi validation với 3–5 seller thật theo nguyên bản Stage 0 (chạy trên DESKTOP thay vì web) — owner chủ trì, tiêu chí exit giữ nguyên.
- Gate kỹ thuật: **Windows máy thật** (PATH Start Menu, cài đặt sạch, rembg detect, upgrade giữ dữ liệu).

**Hậu kỳ v1 (không chặn)**
- **Seed sample projects lần đầu chạy (owner yêu cầu, 2026-11-06):** Workspace trống sau khi dọn dữ liệu test — owner muốn thấy sample design sẵn. 4 STUDIO_TEMPLATES giờ thành project khả-chỉnh-sửa lần đầu mở app (`prj_sample_<tplid>`, badge "Sample" qua field `sample` additive-optional trong projectSchema — không bump version). Luật: marker `samples-seeded.json` ghi SAU khi seed xong (crash giữa chừng → boot sau hoàn tất nhờ id ổn định); store đã có work thật → không seed; user xóa sample → không bao giờ quay lại. Gate: `seedSamples.test.ts` (5 test) + shot verify thêm `samples>=1`; dữ liệu vào shared/studio-templates.ts (một nhà cho renderer + utility).
- PPT Translator: implement thật (hiện chỉ landing).
- rembg bundle hay hướng dẫn cài — quyết CÙNG signing ở bước 7.
- knip vào CI hằng ngày.
- Loopback API mở rộng: upload chunked cho file lớn, SSE progress nếu agent cần.
- Thêm metric ratchet mới khi nợ xuất hiện (any/@ts-ignore/TODO).

## Ghi nhận sửa lỗi sau self-review (2026-10-30)

Self-review phát hiện 4 bug nghiêm trọng do chính bước 4a/4b tạo ra — đã sửa kèm test hồi quy cho MỖI error path (bài học: gate happy-path không bắt được lỗi error-path):

1. **Crash recovery bị gãy**: `exitInfo` không reset + `ensureUtility` cache bỏ qua re-init → 1 crash utility = chết dịch vụ tới khi restart app. Sửa: generation counter (mỗi fork +1), main khóa cache theo cặp (mode, generation); guard exit handler theo generation (không theo object). Gate mới: `crash-smoke` (kill utility giữa phiên → call kế tiếp tự fork + re-init) — chạy trong CI.
2. **429 khóa 6,5 phút**: guard in-flight giảm theo TTL cứng thay vì theo completion. Sửa gốc: `SubmitOptions.onSettled` trong `@oia/tasks` (runToCompletion không bao giờ reject → luôn gọi đúng 1 lần); loopback kế toán chính xác, TTL 15 phút chỉ còn fallback. Test: background task xong → submit ngay không bị 429.
3. **Quit race đốt quota**: cancelAll fire-and-forget đua với SIGTERM kill; codex detached sống sót cha. Sửa: before-quit preventDefault → await cancel (bounded 3s) → kill; utility bắt SIGTERM → cancelAll (giết cây codex) → exit.
4. **Không timeout RPC**: init treo = buildLock đứng vĩnh viễn. Sửa: timeout theo lệnh (chatRun 12 phút, init/rebuild 2 phút, còn lại 30 giây) → fail-fast `UtilityTimeout`.

Kèm 3 món cùng file: exit listener đăng ký 1 lần ở module scope (không tích lũy theo rebuild); chatRun requestId dùng randomUUID (Date.now() đụng khi double-submit); discovery file ghi atomic temp+rename (TP.7).

Còn treo (chưa sửa, đã biết): `oia://` đi vòng IPC lấy bytes + content-type map sao chép tay; TaskNotFound nhận diện bằng chuỗi; parser multipart tự viết; loopback không request log; map rate-limit không dọn; port đổi mỗi rebuild; god-file `main/index.ts`.

## Ghi nhận tổ chức lại tài liệu (2026-10-30, tham chiếu `stablyai/orca`)

- **`AGENTS.md` (root, mới)** — luật cho coding agent: lệnh, trạng thái, 8 hard rules (ratchet, atomic writes, error-path gates, quota là tiền…), kiến trúc map sau bước 4a.
- **`docs/STYLEGUIDE.md` (mới)** — quy ước: bảng mã TP/BR/G/B/D, naming, persistence, error contract, triết lý test, ngôn ngữ (code EN, docs VI, UI EN).
- **`docs/bug-reproductions/` (mới)** — bắt đầu bằng record 4 bug utility-process (triết lý: mỗi lỗi nặng là một pattern có nguy cơ quay lại).
- **Tách thư mục rõ nghĩa**: `design/` → `verification/` (hết nhầm với `designs/`); `desktop-architecture.md`, → `reference/`; `design-direction.md` → `designs/`; `concepts_brief.md` (root) → `history/` + banner archive.
- **SITEMAP.md** giữ vai trò sổ cái thiết kế — thêm dòng reorg plan (đánh dấu "đang thực thi").
- Giữ nguyên: `private/` (swarm archive, competitor RE, ui-audit chờ bước 6), `validation/`, `screenshots/`.
- Không adopt của Orca: `docs/readme/` đa ngôn ngữ (UI đã chốt EN — D8), `docs/site/` (chưa có website sản phẩm).

Bổ sung cùng ngày (vòng 2, theo yêu cầu "tham khảo cả nội dung"): học CÁCH VIẾT của Orca — battle log chưng cất thành luật, mỗi quy tắc gắn bẫy thật + hàm đúng + lý do:
- `docs/reference/cross-platform-support.md` (mới): toàn bộ bẫy đa nền tảng repo này từng dính — .cmd shim, 3 dạng path Windows, PATH từ GUI launch, EPERM rename, detached tree, .cjs preload, oia:// CORS, thứ tự gate loopback.
- `docs/reference/test-antipatterns.md` (mới): mỗi anti-pattern gắn miss thật (4 bug xanh gate, bug language-field, e2e chạy tay một lần).
- `AGENTS.md` nâng nội dung: reuse-before-reimplementing (route web = tham chiếu semantic), quy tắc comment/assertion SAFETY:, kỷ luật UI validation (shot = mắt script, rebuild trước khi smoke), git/gh rerun-failed.

Bổ sung vòng 3 (đọc sâu nội dung các doc khác của Orca): `design-direction.md` thêm bảng **Source of truth** (app.css của desktop là canonical; web globals.css chỉ còn tham chiếu), **UX rules** (bảng thời lượng→feedback có riêng dòng generation 1–6 phút + Cancel luôn hiện; "UI copy không overclaim" — họ hàng của B7; Cancel không destructive; port = mirror không taste lại), và **"Khi doc im lặng"** 4 bước như Orca. `STYLEGUIDE.md` thêm **format review record** (verdict / bảng disposition / invariants / final verification với phạm vi claim thẳng thắn). Các thứ đọc nhưng KHÔNG adopt: folder-per-incident (chưa có incident đủ phức tạp), bug-repro evidence bundle (test trong repo chính là evidence), readme/ ops docs về CI runners (chưa có matrix).

## Ghi nhận vòng readiness review (2026-10-30, sau khi đối chiếu độc lập codebase tại 442fdf4)

Bản review độc lập (verify lại: mọi claim P0 đều khớp code, kèm bằng chứng dòng) phát hiện 4 lỗi chặn phát hành + danh sách nợ F/T. Đã xử lý:

1. **T1 — task lane chạy sai provider** (processors gọi `getImageProvider()` đọc `process.env` của utility process, nơi `IMAGE_PROVIDER` không bao giờ được set): codex mode vẫn trả ảnh mock câm lặng, đi vòng QuotaMeter, hai guard in-flight riêng (chat vs loopback) cho phép 2 job codex song song. Sửa: providers truyền qua `ProcCtx` (instance đã meter của `createServiceContext`); guard duy nhất `meteredGuard` dùng chung theo capability `isMock`; loopback track/release taskId vào đúng slot đó. Gate hồi quy: probe ProcCtx, meter tăng sau task, loopback contention (task giữ slot → submit thứ hai 429 VÀ runChat refused; settle → nhả slot).
2. **T2 — JSON hỏng xoá sạch dữ liệu** (mọi store `catch { items = [] }`, autosave kế tiếp ghi `[]` đè file thật; 3/6 store còn ghi non-atomic): sửa bằng `loadJsonArrayDurable` — ENOENT = fresh start hợp lệ; EACCES/EISDIR = throw; parse hỏng/không phải array = rename `.corrupt-<ts>` giữ nguyên từng byte + log to, chỉ start empty SAU khi bytes an toàn; cả 5 store dùng `atomicWriteJson`. Gate hồi quy: mỗi store một test poison file.
3. **F1 — thiếu single-instance lock**: hai instance = hai utility process ghi cùng userData (atomic queue chỉ per-process). Sửa: `requestSingleInstanceLock` ở module top, instance thua in marker + quit TRƯỚC khi đăng ký handler nào; primary focus cửa sổ trên `second-instance`. Gate e2e mới `OIA_DESKTOP_SI_SMOKE` (CI chạy sau crash-smoke): spawn process THẬT thứ hai cùng userData → phải thoát nhanh kèm marker, không boot utility thứ hai. Lần chạy gate đầu tiên đã chứng minh failure mode sống: child boot full đúng như mô tả review.
4. **T3 — pin phiên bản codex: QUYẾT ĐỊNH KHÔNG PIN (owner, 2026-10-30)**. Review khuyến nghị ghim tag vì app phụ thuộc bề mặt không-cam-kết của codex CLI (`--json` shape, `generated_images`, cờ CLI, login stderr). Owner chọn **giữ `releases/latest`, sai thì sửa**: ưu tiên tự động có bản mới; rủi ro chấp nhận là một release codex mới có thể hỏng đồng loạt cài đặt mới. Điều kiện chẩn đoán đã có sẵn: `RuntimeStatus.version` probe `codex --version` và hiển thị trong runtime panel — khi hỏng, biết ngay đang chạy bản mấy. Không thêm code cho T3.

**F2 — bản release không còn lối dev** (menu tường minh không DevTools/Reload; mọi OIA_DESKTOP_* chỉ chạy khi chưa đóng gói — kể cả REAL_SMOKE; permission handler deny-all; mọi IPC handler kiểm sender là window của app). Gate: test thuần `release-hardening.test.ts` + smoke matrix chạy lại trên build mới.
**F3 — dedupe theo md5 ĐẦY ĐỦ**: tên file mới nhúng md5 32 ký tự (hydrate lại index chính xác sau restart); tên cũ 8 ký tự chỉ là gợi ý, phải đọc bytes hash lại mới chấp nhận dedupe → hai ảnh khác nhau không bao giờ bị alias (~1% ở 9k ảnh). Gate: birthday-search tìm cặp va chạm tiền tố THẬT.
**F4 — dọn vuln cây ship**: fabric 6.9.1 → 7.4.0 (giết luôn chuỗi tar critical + jsdom + canvas native của fabric 6; cả canvas/web port 4 type ref), override image-size → 2.0.4 (pptxgenjs ghim ^1.2.1) kèm gate mới `presentation-lane.test.ts` sinh pptx THẬT. Cây desktop còn đúng 1 advisory: zod (GHSA-mrhx-c7xc-m3w5, chỉ vá ở zod 4) — **nợ riêng: migration zod 3→4 cho @oia/schema + shared/ipc (wire contract — làm riêng, không kèm fix khác)**. CI gate mới `node config/audit/desktop-audit.mjs`: fail khi high/critical chạm cây ship; frozen web/db loại theo cấu hình (tự sạch khi bước 6 xoá); acknowledgment phải kèm lý do + đường thoát.

**T1-guard tự_review (cùng ngày): chính fix guard hôm đó mang 2 defect** — (a) TOCTOU: track đặt SAU `await submit` nên hai submit đồng thời cùng qua check → 2 generation metered chạy song song; (b) `noWait:true` ghim slot 15 phút: submit sync resolve sau khi onSettled đã release id-chưa-tồn-tại, track muộn giữ slot tới fallback TTL và TTL bắn event "failed" giả sau một task thành công (vi phạm B7 — đúng họ lỗi "guard ghim 6,5 phút" từng ghi ở trên, tái phát). Sửa: **reserve slot đồng bộ ngay trước submit** (check+add không có await xen giữa, id riêng `agent-<uuid>`), settle closure đúng-một-lần (flag + clear timer), chỉ arm fallback timer khi chưa settle (sync mode không arm), catch submit释放 reservation, `close()` dọn timer qua Set. Gate: 3 test mới (sync-mode không ghim + không event giả với fallbackTtlMs 150ms; 5 submit đồng thời đúng 1×200; submit lỗi validation không rò reservation) — đã verify cả hai test fail trên loopback.ts bản trước fix.

**B7 persist-health — lỗi ghi disk không còn biến mất** (từ self-review vòng này): toàn bộ save của store đi qua MỘT phễu `atomicWriteJson` → failure được ghi vào `persistenceHealth` (file, errno, đếm số lần, thời điểm; write thành công thì tự xoá entry — health luôn trả lời "store nào ĐANG fail", không phải "từng fail"); call site sync duy nhất (`ChatSessionStore.create`, cũ là `void this.save()` nuốt rejection) đổi qua `fireAndForgetWrite`; surface: thêm `persistence` vào `providerStatus` IPC (basename, không lộ path tuyệt đối) + banner cảnh báo ở Home (chỉ hiện khi có lỗi — UI khỏe không đổi, shot verify). Gate error-path: chmod 0o500 thư mục data thật → EACCES được ghi nhận (cả fire-and-forget lẫn awaited), recovery xoá entry, state dồn 3 lần viết vẫn xuống disk sau khi khỏe lại; skip rõ ràng khi chạy as root. Còn thiếu (tied nợ F5 crash-reporting): log `[persist]` trong bản packaged vẫn chưa có nơi đến — health data đã tới được UI là lớp cứu vãn.

**Quota enforce (hard rule 6) — QuotaMeter từ "đếm" thành "đếm + chặn":** budget hằng ngày theo kind qua env `OIA_DAILY_IMAGE_LIMIT` / `OIA_DAILY_LLM_LIMIT` (bỏ trống = unlimited như cũ; parse sai → `ProviderConfigError` lúc boot — typo không bao giờ được âm thầm hiểu là unlimited). `beginTurn` kiểm tra budget TRƯỚC khi gọi provider: từ chối ném `quota_exceeded` (taxonomy sẵn có) và KHÔNG đếm — bất biến: counter luôn bằng số turn thật sự tới provider, từ chối miễn phí (chỉ +limitHits). Reset theo ngày UTC (clock inject cho test). Funnel là `meterImage`/`meterLlm` nên chat VÀ task lane (T1) cùng bị chặn; task record failed + errorClass quota_exceeded (B7). UI: quota hint Home hiển thị `X/Y` khi có budget. Gate: refusal không chạm provider (probe đếm call), day-roll bằng clock giả, task lane limit=1 (lần 2 failed đúng lớp lỗi), limit=0 = chặn hết hợp lệ, boot từ chối "twelve"/"-3".

**T3-config + F4-pack (cùng ngày, từ self-review):**
- **Một nguồn config (T3):** registry xây provider bằng GIÁ TRỊ THẬT từ env object truyền vào (key openai/fal, model, `CODEX_BIN`, timeout image/planner) — constructor không còn default đọc `process.env` (lỗi: utility nhận config qua RPC env nhưng key thật bị bỏ qua, key rò từ shell đi kèm); mọi env đọc import-time chết (`CODEX_IMAGE_TIMEOUT_MS`, `CODEX_PLANNER_TIMEOUT_MS`, `OPENAI_IMAGE_MODEL` — giá trị mặc định thành hằng, env override do registry thread); main KHÔNG mutate `process.env.CODEX_BIN` nữa — builder thuần `buildServiceEnv` (shared/providers-mode) ghép object mới; NSFW mode đi cùng env object qua call site utility (loopback deps lại có `env`, chỉ cho config). Gate: test registry với process.env ĐỘC (key rò phải bị bỏ qua), builder thuần không đổi base (frozen).
- **F4-pack:** dedupe đổi sha256 (tên file 64-hex; md5 chỉ còn lane legacy: full-32 match + prefix verify, cả hai promote lên sha256 index); `IMAGE_EXTS` về `@oia/schema/uploads.ts` (ipc re-export, loopback dùng chung); `/api/files` key sai → 400, thiếu → 404 (học từ gate: `../` dẫn đầu bị sanitizer bóc thành path trong root → 404, không đi ra ngoài).

Còn treo từ review (đã biết, chưa sửa — không "phát hiện lại" như mới): F7/T8 (fuses, đóng gói, ký số, auto-update), GC asset (phần còn lại của T7 — per-project files đã xong ở bước 5), migration zod 3→4 (F4 dư), 500 lỗi JSON → 400, stderr transcript 500 ký tự, port đổi mỗi rebuild, god-file main/index.ts.
