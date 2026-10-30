# Kế hoạch chốt: desktop-only, bỏ web

**Ngày chốt:** 2026-10-30 (sau phiên review toàn diện + tham chiếu `stablyai/orca`)
**Trạng thái:** quyết định của chủ sở hữu — đây là bản ghi thực thi.

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | Desktop (Electron) là sản phẩm DUY NHẤT. Web app sunset sau khi port xong. |
| D2 | Bỏ hết cái thừa: `apps/web`, `apps/worker`, `packages/db` (code chết), `packages/skills` (chết theo server), `docker/`, Redis CI, BullMQ. |
| D3 | Tổ chức cho macOS + Windows. Gate: build macOS pass KHÔNG phải bằng chứng cho Windows — phải kiểm trên máy Windows thật. |
| D4 | Brand Kit: port panel tối giản sang desktop (dữ liệu đã có trong `tasks/brandkits.ts`, planner đã đọc qua `services/context.ts`). |
| D5 | Toolbox: GIỮ TOÀN BỘ 13 tool + Background Remover. PPT Translator hiện là landing — xếp implement hậu kỳ, không chặn v1. |
| D6 | Không tạo `packages/studio` / `packages/desktop-contract` — chỉ còn 1 consumer (YAGNI), UI ở `apps/desktop`, hợp đồng IPC ở `src/shared`. |
| D7 | Mượn từ Orca 3 thứ: baseline ratchet (nợ đo bằng số, chỉ được giảm), process-host pattern cho CliRuntime Windows, knip dò code chết. Không copy `cloud/`, `mobile/`, `Casks/`. |
| D8 | Mở (chờ chốt sau): desktop UI VI-first hay EN-first. Persona seller Việt → nghiêng VI-first. |

## Cây thư mục đích

```text
oia/
├── package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
├── .env.example               # gọn: chỉ provider (CODEX_*, OPENAI_*, FAL_*) + OIA_*
│                              #   BỎ DATABASE_URL, S3_*, REDIS_URL (infra chết)
├── config/                    # (mới, tối giản — học Orca nhưng không nhân bản)
│   ├── knip.json              # dò code chết (đã tận tụng 1 lần với packages/db)
│   └── baselines/             # ratchet: số nợ kỹ thuật chỉ được GIẢM
│       └── oia-web-imports.baseline.txt   # khởi tạo = 5, về 0 ở bước 2
│
├── apps/
│   └── desktop/               # shell duy nhất
│       ├── src/
│       │   ├── main/          # index, runtime + (mới) updater, rembg integration
│       │   ├── preload/       # contextBridge hẹp, zod-validate
│       │   ├── renderer/
│       │   │   ├── views/     # Home, Editor, Workspace (đã có)
│       │   │   │              #   + Tools.tsx, BrandKit.tsx (port)
│       │   │   ├── components/# + ToolRunner, BrandKitForm
│       │   │   ├── lib/       # + tools-registry, studio-templates, studio-ui,
│       │   │   │              #   provider-errors, i18n — NHẤC TỪ apps/web/libs
│       │   │   ├── fonts/  public/
│       │   └── shared/        # bridge, channels, ipc + IPC tools/brandkit
│       ├── resources/         # (mới) icons .icns/.ico, bin/ theo platform,
│       │                      #   model rembg nếu chọn bundle
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml  # (mới) mac arm64 (+x64 tùy ngân sách), win x64 NSIS
│       └── test/
│
├── packages/                  # giữ nguyên hướng phụ thuộc
│   ├── schema/                # + SCENE_VERSION (1 hằng số, thay 5 chỗ "7.3.1")
│   │                          # + schemaVersion RIÊNG của Oia (khác version Fabric)
│   ├── protocol/  agent/  canvas/  services/
│   ├── providers/             # cli/ nâng theo process-host pattern:
│   │                          #   cmd-shim resolution, tree-kill, PATH từ GUI launch
│   └── tasks/                 # BỎ bullmq.ts + deps bullmq/ioredis; queue in-process thuần
│
└── docs/                      # giữ; dọn docs/private/ui-audit khi xóa web
```

## Bỏ (kèm lý do)

| Bỏ | Lý do |
|---|---|
| `apps/web` | D1. Xóa ở bước 6, SAU khi cắt phụ thuộc ngược (xem B2) |
| `apps/worker` | Triển khai server riêng (BullMQ + ghi chung data dir) — desktop chạy in-process |
| `packages/db` | 0 import (đã verify bằng grep) |
| `packages/skills` | 15 skill POST vào REST của web — chết theo server |
| `docker/`, Redis CI, `bullmq`, `ioredis` | Chỉ phục vụ worker/integration test Redis |
| Tính năng web-only | `for-agents` (API key), `p/[id]` (share link), UI skills/docs |

## Phát hiện review quan trọng (không được quên)

- **B2 — CHẶN:** desktop đang import `@oia-web/libs` ở 5 chỗ (`provider-errors`, `i18n` trong `lib/errors.ts`; `studio-templates`, `studio-ui` trong `Home.tsx`/`Editor.tsx`). Xóa web trước khi cắt = desktop gãy build. Bước 2 phải chạy TRƯỚC bước 6.
- Windows path parsing Codex ĐÃ sửa (`parseImagePathHint` đủ POSIX/`C:\`/`C:/`; `provision.ts` biết `.cmd/.exe/.bat`) — còn thiếu mỗi gate máy thật.
- `services`/`tasks` sạch Next.js — chuyển IPC an toàn.
- Desktop đã có `files:upload` IPC + `oia://files` protocol — nền tool port đã sẵn.
- `runChat` chạy trong main process — chấp nhận v1; chuyển utility process khi thêm công cụ nặng (rembg...).
- Editor desktop 988 dòng ≥ web 890 — port đã dày, chỉ cần checklist parity.
- rembg: pip đặt `rembg.exe`, spawn `.exe` trực tiếp được; rủi ro PATH GUI ≠ terminal — đã có error hướng dẫn.

## Checklist thực thi (thứ tự bắt buộc)

**Bước 1 — Quick wins schema** ✅ XONG (2026-10-30)
- `SCENE_VERSION` hằng số trong `@oia/schema`, thay 5 chỗ `"7.3.1"` (`agent/designer.ts`, `canvas/pages.ts`, `tasks/projects.ts`, web `runner.tsx` ×2).
- Thêm `schemaVersion` của Oia (số nguyên, tăng khi đổi format) — tách khỏi version Fabric.
- Đồng bộ Fabric về 1 version toàn repo (canvas đang `^6.7.1`, apps `^6.9.1`).
- Gate: `pnpm build && pnpm test` xanh.

**Bước 2 — Cắt phụ thuộc @oia-web (CHẶN)**
- Nhấc 4 file `apps/web/libs` → `apps/desktop/src/renderer/lib/`: `studio-templates.ts`, `studio-ui.ts`, `provider-errors.ts`, `i18n.ts`.
- Khởi tạo baseline ratchet = 5; mục tiêu 0 ngay trong bước này.
- Gate: `grep -r "@oia-web" apps/desktop` = 0 kết quả; desktop typecheck/build xanh.

**Bước 3 — BullMQ purge**
- Xóa `packages/tasks/src/bullmq.ts`; queue in-process thuần (cancel in-process đã hoạt động, ioredis lazy-import sẽ tự vô nghĩa).
- Sửa `tasks/package.json`: bỏ `bullmq`, `ioredis`. Bỏ `REDIS_URL` khỏi `turbo.json globalEnv`.
- CI: bỏ redis service. Xóa `docker/`.
- Gate: test packages xanh không cần Redis.

**Bước 4 — Port Tools + BrandKit**
- `views/Tools.tsx` + `components/ToolRunner`: nhấc `tools-registry.ts` + logic `runner.tsx` (~400 dòng); đổi 4 đường fetch → IPC: upload (đã có `files:upload`), task (services in-process), projects.save, provider.status.
- `views/BrandKit.tsx` tối giản: form → `tasks/brandkits.ts`, hiệu lực qua `services/context.ts`.
- Gate: tool local (convert/resize) + tool AI (mock pair) chạy end-to-end trong desktop; brandkit lưu → generation nhận brand guidance.

**Bước 5 — Port nốt editor/templates + cứu test**
- Checklist parity editor web↔desktop (tính năng từng cái, không đo theo dòng).
- Rà 12 file `apps/web/test`: file nào đang cover logic services/tasks qua HTTP route mà packages chưa có → port về mức service. Không xóa web khi coverage giảm.
- Gate: parity checklist tick hết; tổng số test không giảm.

**Bước 6 — Xóa 1 lượt**
- Xóa: `apps/web`, `apps/worker`, `packages/db`, `packages/skills`, `docs/private/ui-audit`.
- Dọn `.env.example` (bỏ DATABASE_URL/S3/REDIS). Viết lại README (quick start chỉ còn desktop).
- Gate: `pnpm build && pnpm typecheck && pnpm test` toàn repo xanh SAU khi xóa.

**Bước 7 — Đóng gói đa nền tảng**
- `electron-builder.yml`: mac arm64, win x64 NSIS; `resources/` icons 2 nền tảng.
- CliRuntime mạnh theo process-host: `windows-cmd-shim-resolution`, tree-kill + test riêng.
- CI matrix: typecheck/test/build trên macos + windows + ubuntu; giữ `desktop-smoke` xvfb Linux làm cổng rẻ; upload artifact mac/win thật.
- Gate: **Windows máy thật** (PATH Start Menu, cài đặt sạch, rembg detect).
- Signing: Apple Developer ID + notarization; Windows cert (hoặc SignPath). **Cần ngân sách — chờ duyệt.**

**Hậu kỳ v1 (không chặn)**
- PPT Translator: implement thật (hiện chỉ landing).
- rembg: bundle vào installer hay hướng dẫn cài — quyết ở bước 7.
- knip vào CI hằng ngày.
- D8: VI-first cho desktop UI.
