# C3 — Live-commerce overlay presets + safe-zone guides

**Ngày:** 2026-10-31
**Trạng thái:** DESIGN (đã duyệt owner cùng 9 chốt ngày 2026-10-31 — "chốt hết theo đề xuất"); triển khai ngay sau doc này.
**Nguồn quyết định cha:** [`feature-upgrade-brainstorm.md`](feature-upgrade-brainstorm.md) mục C3 + Q3 (chốt 2026-10-31). Doc này là bản "tốt nghiệp" theo Q5 — chi tiết C3 sống ở ĐÂY từ nay, brainstorm ngừng cập nhật chi tiết C3.
**Ràng buộc cha:** `design-direction.md` (UI copy không overclaim), hard rules AGENTS.md (B7, D8 English UI), TP.3 (clip = ground truth kích thước artboard).

## Vấn đề

Seller livestream (TikTok Shop / Shopee Live) cần overlay PNG trong suốt (giá flash sale, freeship, countdown) đặt lên OBS/camera. Hôm nay Oia không có: (a) artboard 9:16 trong suốt cho mục đích này, (b) template pack kiểu đó, (c) cách nào biết vùng nào sẽ bị UI nền tảng che. Đối thủ làm video demo đầu tiên cho use case này = nhu cầu thật của khán giả chung.

Sự thật nền tảng (đã researched 2026-10-31, giữ trung thực):
- **Không tồn tại spec sticker/overlay công khai** của TikTok Shop lẫn Shopee Live — mọi "exact dimensions required" trên thị trường là màu marketing (đối thủ cũng quảng cáo vậy). Vì vậy **cấm UI copy** kiểu "kích thước platform yêu cầu" cho overlay.
- **Số liệu safe-zone TikTok** hội tụ từ nhiều nguồn cộng đồng (108–160 trên / 320–484 dưới / ~60 trái / 120–140 phải trên 1080×1920) — bản chất là vùng UI trình xem app (đếm người, thanh comment, cột nút phải), không phải tài liệu chính thức.
- **Số liệu Shopee Live** không có nguồn đo công khai — chỉ biết giải phẫu UI (header trên, chat + product pin dưới, cột nút phải) → ước lượng, gắn nhãn estimate.
- **2 preset ảnh bìa là spec chính thức thật:** Shopee live cover 500×500, TikTok live cover 1080×1920.

Thông điệp bán (đã chốt ở brainstorm): "đừng để đồ quan trọng bị UI nền tảng che" — không hứa spec.

## Goals

1. **Preset artboard "Livestream overlay 1080×1920"**: nền trong suốt (clip fill `transparent`), export PNG giữ alpha.
2. **Preset ảnh bìa chính thức**: "Shopee live cover 500×500" và "TikTok live cover 1080×1920" (2 cái duy nhất được gọi là official).
3. **Template pack overlay** (text native, sửa 0 phí, không cần AI): giá flash sale, badge freeship, khung countdown.
4. **Safe-zone guides là feature chính**: overlay trực quan vùng nền tảng thường che (TikTok / Shopee), bật/tắt được, **không bao giờ xuất ra file**.
5. Mọi chuỗi UI mới tiếng Anh (D8); nội dung text của template là seller copy — được tiếng Việt (content-level, font Be Vietnam Pro).

## Non-Goals

- **Overlay động** (GIF/APNG/WebM) — PNG tĩnh cho OBS là đủ cho v1.
- **Đăng/login nền tảng, publish trực tiếp** — desktop-only, không server.
- **AI generation từ Home composer ở đúng pixel** (exact-px 500×500): composer giữ nguyên trong slice này; cover đi đường preset → AI dock sinh artwork trong editor. Candidate riêng nếu D10 cho thấy cần.
- **Tự nhận nền tảng theo project** — guides là toggle thủ công.
- **Đổi sample seeding** — 4 STUDIO_TEMPLATES sample giữ nguyên; LIVESTREAM_TEMPLATES KHÔNG seed thành project.
- Đổi Wire IPC / loopback / provider — không đụng gì (quota không thay đổi: overlay là native-edit-first).

## CUJ

1. Seller mở Workspace → nút New → chọn "Livestream overlay · 1080×1920" → Editor mở artboard trong suốt. Bật guides (mặc định TikTok) → vùng gạch chéo hiện ở đỉnh/đáy/cột phải; đặt chữ giá tránh vùng đó; export PNG → file trong suốt ở góc, KHÔNG có vệt guides. Kéo PNG vào OBS.
2. Seller đang ở project bất kỳ → panel Templates → nhóm "Livestream" → "Flash sale price" → scene thay thành overlay giá flash sale; sửa số giá một click (0 quota, đúng loop A1: sửa text không regenerate).
3. Seller cần ảnh bìa: New → "Shopee live cover · 500×500" → AI dock sinh artwork nền → đặt chữ → export.
4. Seller bật guides trên artboard 3:4 → guides KHÔNG render, hint "This guide assumes a 9:16 stage (1080×1920)" — trung thực, không giả vờ áp được cho mọi khổ.
5. Hover/tooltip cạnh guides: TikTok — "Community-measured — TikTok publishes no official overlay spec"; Shopee — "Estimated from the app's UI layout".

## Quyết định thiết kế (LV)

| # | Quyết định |
|---|---|
| LV-1 | **Một module dữ liệu** `renderer/lib/livestream-presets.ts`: artboard presets (scene clip) + `LIVESTREAM_TEMPLATES` + safe-zone data. Chỉ renderer dùng (Workspace menu, Editor templates, guides) → KHÔNG đưa vào `shared/` (không có consumer main/utility — tránh phình shared; studio-templates nằm shared vì utility seed sample, cái này thì không). |
| LV-2 | **Workspace "New" thành menu preset:** "Blank canvas" (giữ hành vi cũ: default 1360×2048) + 3 preset livestream. Không nút mới, không view mới. |
| LV-3 | **Overlay = clip Rect fill `"transparent"`** (TP.3 giữ: clip vẫn là ground truth kích thước — `sceneDims` đọc width/height bất kể fill). Cover presets clip fill `white` (như import ảnh hiện nay). |
| LV-4 | **Safe-zone guides là DOM view-layer, KHÔNG phải fabric object** — div position:absolute phủ trên vùng canvas trong stage, toạ độ = fraction × kích thước artboard × zoom (zoom state đã có). Không nằm trong scene JSON / export / thumbnail **xét theo cấu trúc** (không phải theo kỷ luật) — cách duy nhất guides lọt file là ai đó cố tình vẽ nó vào scene, và gate chặn điều đó. |
| LV-5 | **Zone data là FRACTION** của khổ (vd top 130/1920), store kèm `confidence: "measured" \| "estimate"` + `note` hiển thị làm tooltip. TikTok: top 0.068 · bottom 0.25 · left 0.056 · right 0.111 (measured — hội tụ đa nguồn, làm tròn). Shopee: top 0.063 · bottom 0.271 · right 0.073 (estimate — giải phẫu UI, không nguồn đo). Số liệu sống ở code (một nhà) + ghi nguồn ở doc này. |
| LV-6 | **Guides chỉ render khi aspect khớp 9:16 trong dung sai 5%** (cùng ngưỡng cảnh báo aspect của variant tray — một hằng số dùng chung); lệch → toggle disabled + hint CUJ 4. Pref platform (off/tiktok/shopee) sống ở localStorage `oia.liveGuides` (pattern OC-6 — preference UI không phải record). |
| LV-7 | **`Template` schema thêm `category?: string` (additive, D14 — không bump).** Editor Templates panel nhóm theo category khi có: nhóm "Livestream" cho LIVESTREAM_TEMPLATES, phần không category giữ hiển thị như cũ. Templates store import web không đổi (field optional). |
| LV-8 | **Template pack = 3 template, text native trên nền trong suốt:** "Flash sale price" (giá lớn + giá cũ gạch ngang + chữ FLASH SALE), "Freeship badge" (pill FREESHIP + dòng phụ), "Countdown frame" (3 ô HH:MM:SS + nhãn). Màu từ token accent hiện có; font Be Vietnam Pro; KHÔNG image layer → template áp được ở mọi zoom, không cần asset đi kèm (không thêm public/studio artwork). |
| LV-9 | **Export trung thực về alpha:** khi clip fill transparent, dialog export thêm dòng hint "PNG keeps transparency — JPG flattens it" (không chặn định dạng; JPEG không có alpha là sự thật kỹ thuật, không phải lỗi). Gate chứng minh PNG thật sự giữ alpha (xem Gates). |
| LV-10 | **UI copy theo luật:** chỉ 2 preset cover được gắn "official"; overlay preset mô tả "9:16 · transparent · for OBS & streaming apps" — không từ nào nghĩa là "platform yêu cầu". Chuỗi template: tên EN; nội dung text seller copy cho phép tiếng Việt. |

## Thiết kế kỹ thuật

- **`renderer/lib/livestream-presets.ts`** (mới, data-only):
  - `LIVE_ARTBOARDS`: 3 mục `{id, label, sub, scene}` — scene chỉ gồm clip (TP.3); overlay clip `transparent`, covers clip `white`.
  - `LIVESTREAM_TEMPLATES: Template[]` (category `"livestream"`) — mỗi scene: clip trong suốt 1080×1920 + các Textbox/Rect native (dùng helper cùng kiểu studio-templates nhưng thuần text — không artwork).
  - `LIVE_SAFE_ZONES`: `{tiktok: {zones: SafeZone[], confidence, note}, shopee: {...}}` — `SafeZone = {edge: "top"\|"bottom"\|"left"\|"right", fraction: number}`.
- **`renderer/lib/live-guides.ts`** (mới, thuần + test): `guideRects(zones, w, h) → {left, top, width, height}[]` (px trên artboard); `isNineSixteen(w, h) → boolean` (dung sai 5%, hằng số dùng chung với variant tray); pref read/write `oia.liveGuides` (default `"tiktok"`? — xem LV-11).
- **`Workspace.tsx`:** nút New → menu nhỏ 4 mục (Blank + 3 preset) → `createProject({name, scene})` (bridge sẵn có, không wire mới); preset overlay đặt name "Livestream overlay".
- **`Editor.tsx`:** (a) toolbar thêm nút toggle guides (icon shield/viewport) + chọn nền tảng khi bật — chỉ enabled khi `isNineSixteen`; (b) render div `.guideZone` theo `guideRects × zoom` trong stage container, kèm 1 label nền tảng + tooltip note; (c) Templates panel: render LIVESTREAM_TEMPLATES thành nhóm "Livestream" trên STUDIO_TEMPLATES, cùng `applyTemplate` (replace scene — hành vi sẵn có).
- **`packages/schema/src/template.ts`:** `category: z.string().trim().min(1).max(40).optional()`.
- **`app.css`:** `.guideZone` (hatch pattern CSS `repeating-linear-gradient`, đỏ amber, `pointer-events: none` — guides không bao giờ cản chỉnh canvas), `.guideLabel`, menu preset Workspace.
- **Export lane (Editor.tsx hiện có):** hint alpha theo LV-9 — đọc clip fill từ scene hiện tại.

## LV-11 (chốt khi viết code, ghi lại ở đây)

Default pref guides = **`"off"`** — seller chủ động bật (guides là trợ giúp trực quan, không phải cảnh báo bắt buộc; авто-bật trên mọi project 9:16 sẽ nhiễu với người làm poster 9:16 thường). Nếu D10 cho thấy seller quên bật → đổi default theo dữ liệu.

## TP / luật bị chạm

- **TP.3:** mở rộng ngữ nghĩa — clip fill `transparent` là nền tảng hợp lệ của artboard (không chỉ màu đặc). `sceneDims` không đổi.
- **B7:** guides không phải record — không persist vào project (view state + localStorage pref); export không chứa guides là bất biến có gate.
- **D8:** mọi label UI mới EN; seller copy trong template được VI.
- **D14:** `category` optional trên Template — không bump OIA_SCHEMA_VERSION.
- **UI copy không overclaim (design-direction):** LV-10 — cấm "required/platform spec" cho overlay; 2 cover preset được nói "official" vì đúng.

## Gates (chạy khi implement xong)

1. ✅ **Unit `livestream-presets`/`live-guides`** (desktop test): mọi scene parse qua `sceneSchema`; overlay clip fill transparent; cover đúng 500×500 & 1080×1920; `guideRects` nằm trong khổ, không âm, không đảo; `isNineSixteen` đúng biên (5% trên/dưới); pref round-trip + garbage storage + throwing storage (pattern OC-6).
2. ✅ **Gate alpha PNG (bắt buộc):** render scene overlay template qua đúng lane export (fabric toDataURL PNG, cùng code path Editor) → decode PNG → pixel góc alpha = 0. Đây là gate chống "transparent mất im lặng" — họ bug OCR chết thầm lặng.
3. ✅ **Gate guides-ngoài-file:** export với guides đang BẬT → bytes PNG identical với guides TẮT (cùng scene) — pin bất biến "không bao giờ xuất ra file" bằng evidence, không phải bằng lời hứa.
4. ✅ **Shot (exit code mới):** Workspace New menu hiện 4 mục → tạo overlay project → Editor vẽ guides (div hiện diện + computed style hatch + vị trí đúng theo zoom) → aspect 3:4 → guides disabled + hint → áp template "Flash sale price" → Textbox giá tồn tại trong scene → hint alpha hiện trong export dialog.
5. ✅ `pnpm build && pnpm test && pnpm typecheck` toàn repo xanh.

## Nguồn safe-zone (researched 2026-10-31)

- TikTok 1080×1920 đa nguồn hội tụ: ~108–160 top · ~320–484 bottom · ~60 left · ~120–140 right (safe-zone tools cộng đồng + hướng dẫn ads/video 2025–2026; không nguồn chính thức nào công bố zone LIVE — đúng dự đoán brainstorm). Làm tròn: 130/480/60/120.
- Shopee Live: không có số đo công khai (chỉ xác nhận giải phẫu UI: chat overlay đáy-trái, comment pin đáy, product pin đáy, header trên, cột nút phải). Ước lượng thận trọng: 120 top / 520 bottom / 140 right trên 1080×1920.
- Cover specs chính thức: Shopee live cover 500×500 · TikTok live cover 1080×1920 (theo researched ghi ở brainstorm C3 mục 3).

## Rủi ro / cạnh đã nghĩ

- **Zone sai số thực tế:** đây làước đo cộng đồng/ước lượng — mitigation là nhãn confidence + tooltip trung thực (LV-5), không bao giờ trình bày như spec. Sai lệch vài chục px không phá use case (guides là "tránh vùng", không phải "khớp pixel").
- **JPEG flatten:** người dùng chọn JPG cho overlay sẽ mất trong suốt — hint LV-9 nói trước, không chặn (không overclaim hai chiều).
- **Fabric originX/originY (bài học F4-fix):** template mới viết theo ngữ nghĩa fabric 7 + `fabricV6OriginDefaults()` đã áp dụng toàn app — dùng helper `text()` cùng kiểu studio-templates (đã sống đúng trên corpus thật) thay vì tạo object tay.
- **Template thay toàn bộ scene:** `applyTemplate` = replace scene (hành vi sẵn có của mọi template) — seller biết vì canvas đổi ngay; không làm "merge" mới (tránh lặp lại phức tạp merge-scene đã đính cải ở A1).
- **Guides và pan/zoom:** div layer đọc zoom state + kích thước stage mỗi render — không phải transform CSS trừ theo viewportTransform (đơn giản hơn và không đua với fabric internals).
