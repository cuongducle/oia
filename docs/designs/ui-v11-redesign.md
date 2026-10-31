# UI v1.1 — thiết kế lại khung app sau 4 tính năng v1.1

**Ngày:** 2026-10-31
**Tác giả:** TienNV
**Trạng thái:** DRAFT — chờ owner duyệt (các câu hỏi ở mục cuối). Chưa có dòng code nào.
**Nguồn cha:**
- [`../reference/design-product-ui-2026.md`](../reference/design-product-ui-2026.md) — chẩn đoán UI, 7 luật "sản phẩm thiết kế", gap table P0–P2 (option C presentation pass đã ship; phần còn lại owner xếp sau đóng gói).
- [`feature-upgrade-brainstorm.md`](feature-upgrade-brainstorm.md) — A1/C1/C3/B1 đã ship (v0.2.0); A2/A3/E1/D1/C2 là candidate.
- [`design-direction.md`](design-direction.md) — token, font, UX rules (feedback theo thời lượng, không overclaim, Cancel không destructive). Doc này đổi **cấu trúc**, không đổi bảng màu hay hướng "editorial studio".

**Ràng buộc cứng:** D8 (UI tiếng Anh), hard rule 6 (quota là tiền — mọi hành động tốn quota hiện giá trước), B7 (records must not lie), wire contract giữ nguyên (IPC channel, `errorClass`, envelope loopback — xem mục "Không đổi").

---

## Vấn đề

Bốn tính năng v1.1 đã ship đúng spec của từng doc, nhưng mỗi cái được **gắn vào bố cục cũ ở một chỗ khác nhau**. Bằng chứng: `pnpm --filter @oia/desktop shot` trên `main` @ `9f35eb3` (v0.2.0, mock pair, 2026-10-31) — `out/desktop-{home,outline,editor,workspace,live-overlay,deconstruct}.png`.

### 1. Lối "bắt đầu một thiết kế" nằm rải 6 chỗ

| Chỗ | Bắt đầu bằng gì |
|---|---|
| Home — composer | Prompt (+ 4 chip Poster / Social post / Presentation / Banner) |
| Home — "A little inspiration" | 4 studio template (+ tab All templates) |
| Workspace — "New project" (menu) | Blank canvas + 3 preset livestream (C3) |
| Workspace — "New from image" | Ảnh làm nền |
| Workspace — "New from old design" | Ảnh cũ → tách chữ (B1, tốn ≈ 1 image + 1 read) |
| Editor — panel Templates | Livestream / Posters / Your library (thay trang hiện tại) |

Thêm trang **Tools** (14 tool) là lối thứ 7. Người dùng phải nhớ *tính năng nào nằm ở view nào*; "New from image" và "New from old design" đặt cạnh nhau nhưng một cái miễn phí, một cái tốn quota.

### 2. Hạ tầng vẫn chiếm vị trí đẹp nhất của Home
Dưới composer vẫn là banner "Trial mode — placeholder images, not real AI" + card "Codex is ready · codex 0.166.0 · ChatGPT · bundled with the app" với Auto/Codex/Trial, Sign out, Use real Codex (triệu chứng #3 của design-product-ui-2026 — chưa xử lý). Card outline C1 chen vào giữa composer và hàng chip, rộng nửa cột.

### 3. Editor vẫn là "AI chat wrapper có canvas"
- **Không có panel Layers.** B1 tạo nhiều text layer một lúc; A1 "Replace selected layer" cần chọn đúng layer ảnh — nhưng không có chỗ nào nhìn thấy danh sách layer.
- **Không có inspector.** Chỉ có thanh text tạm (màu, căn lề, cỡ chữ, letter spacing) khi chọn text; ảnh/shape không có X/Y/W/H, xoay, opacity.
- **Rail "Settings" thật ra là cài đặt trang** (màu nền, kích thước artboard, size gợi ý) — tên sai, nằm lẫn với công cụ.
- **Icon không nhãn trên top bar:** ✦ là "Toggle AI assistant", 🌐 là "Publish template".
- **AI dock còn log thô:** "Designer Agent · Image Generator · Manager Agent" + câu narrative dài (gap P0 "progress = step states" chưa làm). Nút "Replace selected layer" bị disable mà không nói vì sao.

### 4. Chi phí hiển thị mỗi chỗ một kiểu
"≈ 1 image" (AI dock), "2 pages ≈ 2 images" (composer + outline card + nút Generate), "≈ 1 image + 1 read" (dialog B1); không có chỗ nào cho biết **đã dùng bao nhiêu hôm nay** dù `QuotaMeter` đã có counter + budget (`OIA_DAILY_IMAGE_LIMIT`).

### 5. Candidate tiếp theo không có chỗ đứng
A2 (plan card), A3 (sửa theo layer đang chọn), E1 (chọn brand kit ngay trong composer — hiện brand kit chỉ chạy qua `applyByDefault`, composer không có pill nào), D1 (recipe library), C2 (ảnh dài). Không có khung mới thì mỗi cái lại là một nút gắn tạm.

---

## Goals

1. **Một khung app (shell) chung:** sidebar trái thay top nav; mọi view nằm trong cùng khung; trạng thái hạ tầng (Codex, quota) xuống chân sidebar.
2. **Một lối "Create":** nút **New** duy nhất (⌘N / Ctrl+N) mở **Create sheet** gom mọi điểm bắt đầu theo 4 làn: *Describe it* · *Start from a size* · *Start from a template* · *Bring an image*.
3. **Home = composer + kết quả + gần đây.** Composer là hero (thesis prompt-first giữ nguyên); chip định dạng thành **chip kích thước theo nền tảng**; pill **Brand kit** trong composer (E1-a); outline card C1 là một bước của composer, không phải card lơ lửng.
4. **Editor có tầng chỉnh sửa tất định:** panel **Layers** (rail trái) + panel phải dạng tab **Design | AI** (inspector theo selection) + **thanh nổi theo selection** (contextual toolbar).
5. **Một quy tắc hiển thị chi phí + đồng hồ quota:** mọi hành động tốn quota dùng cùng một component giá; chân sidebar hiện "Today: X images" (và "/ Y" khi có budget).
6. **Tiến trình có thiết kế:** một component step-states dùng chung cho Home, AI dock, B1 deconstruct và tool AI — chấm dứt log tên agent.
7. **Settings là một trang thật:** Runtime (Codex), Usage, Data (import web, dung lượng), For agents, About.

## Non-Goals

- Không đổi bảng màu, font, hướng editorial studio (`design-direction.md`).
- Không thêm tính năng sinh ảnh mới (không "Generate 3" ở doc này — giữ opt-in như đã chốt ở gap P0, làm doc riêng).
- Không đổi IPC channel, `errorClass`, schema scene, loopback API, quota logic. Toàn bộ thay đổi nằm ở `apps/desktop/src/renderer` (+ tối đa một IPC đọc-chỉ nếu Usage cần — xem UX-9).
- Không làm D1 recipe library, C2 long-image, A3 đầy đủ — chỉ **chừa chỗ** cho chúng trong khung mới.
- Không làm ⌘K command palette (ghi nhận là candidate).
- Không đổi Windows/mac chrome đã ship (7c: hiddenInset, vùng kéo) — sidebar mới phải giữ vùng kéo + padding traffic light.

---

## Thiết kế

### Khung app (shell)

```
┌────────────┬──────────────────────────────────────────────────────┐
│ oia.       │                                                      │
│            │                                                      │
│ [+ New  ⌘N]│                 (view hiện tại)                      │
│            │                                                      │
│ ⌂ Home     │                                                      │
│ ▦ Projects │                                                      │
│ ◫ Templates│                                                      │
│ ⚒ Tools    │                                                      │
│ ◈ Brand kits│                                                     │
│            │                                                      │
│ ─────────  │                                                      │
│ ● Codex · ready                                                   │
│ Today: 3 images        │                                          │
│ ⚙ Settings │                                                      │
└────────────┴──────────────────────────────────────────────────────┘
```

- **Projects** = Workspace cũ (đổi tên cho đúng nghĩa người dùng). **Templates** là view mới gom studio templates + livestream pack + "Your library" (templates đã publish) — cùng dữ liệu panel Templates của Editor.
- **For agents** rời nav chính vào **Settings → For agents** (tính năng cho dev, không phải cho seller) — *câu hỏi Q2*.
- Chân sidebar: chip trạng thái runtime (một chấm màu + chữ: "Codex · ready" / "Trial mode" / "Codex · sign in needed"), click → Settings › Runtime; dòng usage hôm nay; Settings.
- Editor vẫn là màn full-screen riêng (giữ như hiện nay), có nút ← về view trước.

### Create sheet (một lối bắt đầu)

```
┌ Create ───────────────────────────────────────────────── ✕ ┐
│ Describe it                                                 │
│ [ A Shopee banner for a 20% milk tea sale…           ] [→] │
│                                                             │
│ Start from a size                                           │
│ Marketplace  [Shopee 1:1] [Lazada 1:1] [TikTok Shop 1:1]    │
│ Social       [TikTok 9:16] [Story 9:16] [Post 4:5]          │
│ Livestream   [Overlay 1080×1920] [Shopee cover ★] [TikTok cover ★] │
│ Other        [Poster] [Presentation 16:9] [Custom…]         │
│                                                             │
│ Start from a template            Browse all templates →    │
│ [thumb] [thumb] [thumb] [thumb]                             │
│                                                             │
│ Bring an image                                              │
│ [Use as background]   free                                  │
│ [Make its text editable]   ≈ 1 image + 1 read               │
└─────────────────────────────────────────────────────────────┘
```

- **Describe it** chuyển sang Home với prompt đã điền (Home vẫn là nơi chạy generation).
- **Start from a size** gom `SIZE_PRESETS` (marketplace) + preset livestream C3 — ★ = 2 spec chính thức duy nhất (LV-10: không chữ nào khác ngụ ý "platform yêu cầu").
- **Bring an image** gom "New from image" (miễn phí) và "New from old design" (B1) thành **một** chọn file → hai lựa chọn có giá đặt cạnh nhau. Dialog xác nhận của B1 giữ nguyên.
- "Import from web app" không thuộc Create — chuyển sang Settings › Data (việc làm một lần).
- Cùng sheet mở từ: nút New ở sidebar, nút New ở Projects, ⌘N/Ctrl+N, và "+ New page from…" trong Editor (chỉ hiện làn size + template).

### Home

```
┌──────────────────────────────────────────────────────────────┐
│ From a spark to something great.                             │
│  Flash sale · New product · Livestream · Menu · Social · Deck │  ← chip "làm gì" (use case)
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ banner trà sữa giảm 20% ngày 8/11                        │ │
│ │ 📎 [Skills ▾] [Shopee 1:1 · 2K ▾] [Brand: Lumea ▾] [Pages: 1 ▾] │
│ │                         ≈ 1 image   [ Create → ]         │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌ Step 2 of 2 · Review the outline (khi Pages ≥ 2) ──────┐  │
│  │  … (outline card C1, full width của composer)          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌ Result ────────────────────────────────────────────────┐  │
│  │ ● Planning ✓  ● Painting …  ○ Composing   [Stop]       │  │  ← step states
│  │ [canvas card + Open in editor / Download PNG]          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Recent designs                               See all →     │
│  [thumb] [thumb] [thumb] [thumb]                             │
│  A little inspiration                                        │
└──────────────────────────────────────────────────────────────┘
```

- Banner Trial mode + card runtime **rời Home** → chip ở chân sidebar + một dòng nhỏ trong composer khi đang ở Trial ("Trial mode · placeholder images" — vẫn hiện đúng chỗ người dùng sắp bấm Create, đúng tinh thần TP.6-3 mock labeling).
- Chip định dạng cũ (Poster/Social post/Presentation/Banner) thay bằng **chip "làm gì" đặt TRÊN composer** theo từ vựng seller: Flash sale · New product · Livestream · Menu · Social post · Deck (luật DNA #6). Chọn chip = gợi câu mở đầu cho prompt + đặt khổ mặc định hợp lý (Livestream → 9:16, Deck → 16:9 + Pages 3); người dùng vẫn đổi được. Khổ và độ phân giải gộp **một pill** trong composer ("Shopee 1:1 · 2K ▾") — menu của pill nhóm theo nền tảng như Create sheet.
- **Skills ▾ trong composer** (và hàng chip nhanh trong ô nhập của tab AI): các tool hay dùng (Remove background, Resize for…, Make text editable) gọi được ngay trong luồng; trang Tools vẫn là thư viện đầy đủ.
- **Brand pill** (E1-a): chọn kit cho request này; mặc định = kit `applyByDefault`. Chỉ đổi phần composer — việc kit tác động lên text layers (E1-c) là doc riêng.
- Outline card C1 thành **bước 2 của composer** (cùng chiều rộng, nhãn "Step 2 of 2"), hành vi và gate C1 giữ nguyên.
- "Recent designs" đưa lên trước inspiration (luật DNA #3).
- "AI notes" (narrative) giữ collapsible trong result card.

### Projects (Workspace cũ)

- Header: tiêu đề + ô tìm + nút **New** (mở Create sheet). Bốn nút cũ biến mất khỏi header (gom vào Create / Settings).
- Bộ lọc: All · Samples · theo khổ (Square · Portrait · Landscape · 9:16).
- "Recent conversations" thành tab **AI history** trong Projects.

### Editor

```
┌ ← Oia  Livestream overlay        ↶ ↷  Saved 14:02     [AI] [Share ▾] [Export] ┐
├────┬───────────────┬─────────────────────────────────────┬────────────────────┤
│Tmpl│ Layers        │      LIVESTREAM OVERLAY · 1080×1920 │ [Design] [AI • 2]  │
│Upl │ ▣ FLASH SALE  │   ┌──────── T  B  ≡  32 ▾  ● ─┐     │ Position           │
│Text│ ▣ 299.000₫    │   │   (contextual toolbar)    │     │ X 120  Y 480       │
│Shap│ ▣ 199.000₫    │   └───────────────────────────┘     │ W 840  H 240  ↻ 0° │
│Tabl│ ▭ Red panel   │        [ artboard ]                 │ Text               │
│Draw│ 🖼 Background │                                     │ Be Vietnam Pro ▾   │
│Lay │  👁 🔒 ⠿       │                                     │ 96 · Bold · #FFF   │
│Page│               │  Page 1/1 [+]   − 33% + ⛶  Guides ▾ │ Opacity 100%       │
└────┴───────────────┴─────────────────────────────────────┴────────────────────┘
```

- **Rail:** Templates · Uploads · Text · Shapes · Tables · Draw · **Layers** (mới) · **Page** (đổi tên từ "Settings": màu nền, kích thước, size gợi ý).
- **Layers panel:** thứ tự object Fabric (trên cùng = trước nhất), tên layer (dùng `name` đã có — khối chữ planner đã mang role), icon loại, ẩn/hiện, khoá, kéo đổi thứ tự, click = chọn trên canvas. Layer `origin: "user"` có dấu nhỏ "You" — giúp người dùng hiểu vì sao AI không xoá nó (TP.10).
- **Panel phải dạng tab:**
  - **Design** — inspector theo selection: Position (X/Y/W/H/rotation), Appearance (opacity, fill), Text (font, size, weight, color, align, spacing — thay thanh text tạm hiện nay), Image (Replace image, Crop, Remove background, **Edit with AI** → chuyển tab AI với selection đã gắn = bước đầu của A3). Không có selection → hiện thuộc tính trang (như panel Page).
  - **AI** — dock hiện tại + khay variant A1. Badge số variant mới khi đang ở tab Design. Layer đang nhắm hiện thành **chip "@ <tên layer>"** ngay trong ô nhập (đến từ selection, "Edit with AI" hoặc gõ `@` — chọn từ danh sách layer của canvas); hàng chip skill nhanh nằm trên ô nhập. Nút chính của variant đổi nhãn theo đúng layer sẽ bị thay ("Replace background image") thay cho chữ chung chung "Replace selected layer".
- **Contextual toolbar** nổi ngay trên selection: 4–6 thao tác hay dùng nhất của loại object (text: font, size, bold, align, màu; ảnh: Replace, Crop, Edit with AI; nhiều object: Align, Group). Thanh text tạm hiện tại được thay bằng thanh này.
- **Variant card:** khi chưa chọn layer ảnh, nút "Replace selected layer" vẫn disable nhưng có dòng giải thích "Select an image layer to replace it" (hiện đang disable câm).
- **Top bar:** icon có nhãn/tooltip rõ; "Publish template" vào menu **Share ▾** (Publish as template · Save to library); "Saved" kèm giờ ("Saved 14:02" — luật DNA #7 trust signal).
- **Guides (C3):** giữ ở thanh zoom, đổi thành menu "Guides ▾" (Off · TikTok · Shopee) — hành vi LV-6 giữ nguyên.

### Step states dùng chung

Một component `<RunSteps>` nhận danh sách bước + trạng thái (`pending | running | done | failed | cancelled`), luôn kèm nút **Stop** khi đang chạy (UX rule: generation 1–6 phút, Cancel luôn hiện):

| Luồng | Các bước |
|---|---|
| Banner / deck (Home) | Planning → Painting (k/N) → Composing |
| AI dock (Editor) | Reading your canvas → Painting → Ready to apply |
| Deconstruct (B1) | Reading text → Cleaning the image → Placing text |
| Tool AI | Uploading → Generating → Saving |

Map từ event sẵn có (`ChatEvent` status / task progress) — không đổi protocol. Tên agent nội bộ (Designer / Image Generator / Manager) không còn hiện ra UI.

### Chi phí và quota

- Một component `<CostHint>` cho mọi hành động tốn quota, một format: `≈ N image(s)` · `≈ N image(s) + M read(s)`; **ẩn khi provider là mock** (đúng hành vi hiện nay của A1/B1); đặt **ngay cạnh nút hành động**, không ở chỗ khác.
- Chân sidebar: `Today: X images` (+ `/ Y` khi có `OIA_DAILY_IMAGE_LIMIT`), click → Settings › Usage. Đọc từ `providerStatus` (đã trả quota counters). Khi hết budget: chip chuyển màu cảnh báo + nút Create disable với lý do (map `quota_exceeded` sẵn có).

### Settings (trang mới)

| Mục | Nội dung (đều đã có — chỉ dời chỗ) |
|---|---|
| Runtime | Runtime panel hiện tại (trạng thái Codex, Auto/Codex/Trial, Sign in/out, cài đặt) |
| Usage | Counter hôm nay theo loại (image / read), budget nếu có |
| Data | Import from web app, đường dẫn thư mục dữ liệu, cảnh báo `persistenceHealth` |
| For agents | Màn For agents hiện tại (keys, base URL, agent jobs) |
| About | Phiên bản app, phiên bản codex đi kèm, license |

---

## CUJ

1. **Seller mới mở app lần đầu (Trial mode):** Home chỉ có composer + chip size + inspiration; chân sidebar "Trial mode"; trong composer dòng nhỏ "Trial mode · placeholder images". Bấm chip "Codex · sign in" → Settings › Runtime → đăng nhập → quay lại Home, dòng Trial biến mất.
2. **Banner Shopee có brand kit:** gõ prompt → chip "Shopee 1:1" → Brand pill chọn "Lumea" → nút Create cạnh `≈ 1 image` → result card hiện step states → Open in editor.
3. **Sửa giá trên banner cũ:** sidebar New → Bring an image → chọn file → "Make its text editable · ≈ 1 image + 1 read" → dialog B1 → step states → Editor mở, panel Layers liệt kê từng khối chữ; chọn "299.000₫" trong Layers → inspector Text → sửa.
4. **Overlay livestream:** New → Livestream → Overlay 1080×1920 → Editor; Guides ▾ TikTok; Templates → Flash sale price; Layers thấy 3 text + 1 panel.
5. **Thay ảnh nền bằng AI, giữ chữ:** chọn layer nền trong Layers → contextual toolbar "Edit with AI" → tab AI mở với layer đã gắn → gõ "make it warmer" (`≈ 1 image`) → variant → "Replace selected layer" (đã bật vì có selection).
6. **Hết quota hôm nay:** chân sidebar `Today: 20 / 20` màu cảnh báo; nút Create disable kèm "Daily image limit reached — resets at 00:00 UTC".

## Quyết định thiết kế (UX)

| # | Quyết định |
|---|---|
| UX-1 | Sidebar trái thay top nav (5 mục + New + chân trạng thái). Giữ vùng kéo cửa sổ (7c) ở dải trên của sidebar; padding traffic light 92px trên darwin. |
| UX-2 | Một Create sheet là **nơi duy nhất** khởi tạo project mới ngoài Home composer; mọi nút "New…" khác mở sheet này. |
| UX-3 | "Bring an image" hiện hai lựa chọn kèm giá cạnh nhau; lựa chọn tốn quota luôn qua dialog xác nhận B1 sẵn có. |
| UX-4 | Hạ tầng (runtime, trial, quota) chỉ xuất hiện ở chân sidebar + Settings; Home giữ đúng một dòng Trial trong composer. |
| UX-5 | Outline card C1 là bước 2 của composer (cùng chiều rộng), không đổi logic C1. |
| UX-6 | Editor: panel phải là tab Design \| AI; Layers ở rail; contextual toolbar thay thanh text tạm. |
| UX-7 | `<RunSteps>` và `<CostHint>` là hai component dùng chung bắt buộc cho mọi luồng tốn quota; không chuỗi giá viết tay trong view. |
| UX-8 | Rail "Settings" của Editor đổi tên "Page" (đúng nội dung). |
| UX-9 | Không thêm IPC ghi nào. Nếu Usage cần dữ liệu ngoài `providerStatus`, thêm **một** IPC đọc-chỉ, khai báo zod ở `shared/ipc.ts` như mọi channel. |
| UX-10 | Mọi chuỗi mới tiếng Anh (D8); nhãn từ vựng seller (Shopee, Flash sale…) là nội dung, giữ nguyên. |

## Không đổi

- Wire: IPC channel hiện có, `errorClass`, error `name`, envelope loopback, schema scene/project, `OIA_SCHEMA_VERSION`.
- Hành vi: G3 metered-once, outline gate C1, khay variant A1, guides LV-6, dialog B1, autosave.
- Token màu/font trong `app.css`; ảnh studio; seed sample.

## Kế hoạch slice (mỗi slice một PR, gates xanh)

| Slice | Nội dung | Gate |
|---|---|---|
| R1 | Shell: sidebar, chip runtime, usage, trang Settings (dời Runtime / For agents / Import web) | shot: mọi view có sidebar + mục active; Home không còn card runtime; Settings › Runtime hiện đủ hành động cũ |
| R2 | Create sheet + Projects header + gom "Bring an image" | shot: mở sheet từ 3 lối; test: sheet tạo project đúng size preset (kể cả livestream ★); B1 vẫn qua dialog |
| R3 | `<RunSteps>` + `<CostHint>`, thay ở Home / AI dock / B1 / tool AI | unit: map event → step; shot: không còn chuỗi "Designer Agent"; CostHint ẩn ở mock |
| R4 | Editor Layers panel | shot: thứ tự layer khớp Fabric; test: kéo đổi thứ tự + ẩn/khoá persist qua save/reload |
| R5 | Editor tab Design (inspector) + contextual toolbar; rail "Page" | shot: chọn text → toolbar + inspector Text; chọn ảnh → Replace/Edit with AI; test: sửa X/Y/W/H ghi đúng vào scene |
| R6 | Home: chip size nền tảng, Brand pill, outline thành bước 2, Recent designs | shot: chip đặt đúng ratio; test: Brand pill gửi `brandKitId` (đã có trên `ChatRequest`) |

R1–R3 không đụng canvas → rủi ro thấp, có thể làm song song với T6 (Windows thật). R4–R5 là phần lớn nhất (Fabric event + undo/redo).

## Hệ thị giác v2 (để đạt chất lượng phát hành)

Vòng mockup đầu đúng cấu trúc nhưng chưa đạt chất lượng phát hành: render lại cả 6 màn và soi thì ra 5 lỗi lặp — artwork là khối màu phẳng (đọc như wireframe), tím dùng cho gần như mọi nút/active/chip, viền 1px ở mọi khối (đúng triệu chứng "shadcn mặc định" #5 của design-product-ui-2026), icon thiếu/không đồng bộ, tiến trình thành ba chip xanh nặng. Hệ v2 sửa ở mức token — áp cho mọi view, không theo từng màn. Đối chiếu tham khảo: open-design.ai (app desktop cùng tư thế "agent cục bộ / BYOK", đo trực tiếp CSS trang của họ 2026-10-31: chrome trung tính, nút chính màu mực dạng pill, một màu nhấn dùng rất ít, bóng dài mềm thay viền) — chỉ học nguyên tắc, không lấy font, màu hay bố cục của họ.

| Token / luật | v1 (hiện tại, `app.css`) | v2 đề xuất |
|---|---|---|
| Nền chrome | `#fafaf9`, nội dung trên cùng mặt phẳng | Chrome `#f3f2ef`; nội dung nằm trên **tấm trắng nổi** (radius 18) và panel nổi (radius 16) — kiểu UI3 |
| Nút chính | Tím `#7050e5` | **Mực `#1d1c21`**, pill (radius 999), cao 40 / 34 |
| Màu tím | Nhấn chung | **Chỉ cho AI và vùng chọn** (`#6d4ce8`: tay nắm chọn, nhãn layer trên canvas, nút "Edit with AI", chip @layer) — nhìn tím là biết "AI / đang chọn" |
| Phân lớp | Viền 1px `#e5e3ea` | Tông nền (`#f6f5f3` / `#f3f2ef`) + bóng mềm `0 24px 48px -24px rgba(20,18,30,.18)`; viền chỉ còn dạng ring 1px rất nhạt khi cần |
| Chữ | Serif + sans trộn ở nhiều cấp | Instrument Serif **chỉ cho tiêu đề trang** (34–58px); UI Be Vietnam Pro 13 (chrome) / 14 (nội dung) / 17 (ô prompt); số dùng `tabular-nums` |
| Chữ hiển thị tiếng Việt | line-height .92–1 | **line-height ≥ 1.0 + padding trên** cho chữ lớn có dấu — mockup v2 bắt được dấu hỏi của "Ả" bị cắt khỏi khung chọn |
| Icon | Thiếu / glyph unicode (↶ ⛶ ✦) | Một bộ nét 1.7px, 18–20px, cùng hình học |
| Trạng thái chạy | Ba chip xanh | **Một dòng**: chấm màu + "Done in 41 s · 1 image used" |
| Artwork trong UI | Khối màu | Ảnh thật (4 ảnh studio đã có trong `renderer/public/studio`) — mọi empty/sample/recent đều phải là thiết kế thật, đúng luật DNA #5 |
| Canvas editor | Nền xám phẳng | Lưới chấm nhạt; artboard có bóng sâu; nhãn kích thước; tay nắm 8px trắng viền tím; nhãn "tên · W × H" dưới vùng chọn |

Mockup v2 trên canvas (Home, Create sheet, Editor, Editor · AI, Projects, Settings) đã áp toàn bộ bảng này. Khi triển khai: token v2 vào `app.css` ở slice R1 (một lần, trước mọi slice khác) để R2–R6 không phải tự chọn màu.

## Đối chiếu đối thủ tham chiếu (2026-10-31)

Nguồn: trang công khai của đối thủ tham chiếu (landing + phần mô tả tính năng kèm ảnh minh họa giao diện app), đọc 2026-10-31; app thật nằm sau đăng nhập nên không vào. Chỉ học pattern tương tác — không sao chép asset, tên, bố cục (cùng ghi chú pháp lý với `design-product-ui-2026.md`).

| Pattern của họ | Quyết định cho Oia | Đã đưa vào |
|---|---|---|
| Chip loại nội dung (Presentation, Festival, Poster, Invitation, Resume, E-commerce, Menu, Social Media) đặt **trên** ô prompt | **Lấy**, nhưng đổi sang use case của seller VN (Flash sale, New product, Livestream, Menu, Social post, Deck) | Home, R6 |
| Hàng điều khiển trong ô prompt: `+` · `1:1 \| 2K` một pill · `Auto Pages ▾` · `Outline Mode` toggle · `Brand Kit ▾` | **Lấy** gộp khổ + độ phân giải một pill; Brand pill; outline toggle chỉ hiện khi Pages ≥ 2 (đã đúng với C1) | Home, R6 |
| Preset Skills chọn ngay trong ô chat (Long image, XHS, Presentation, File translator, Background remover, Image resizer) | **Lấy**: `Skills ▾` trong composer + chip skill nhanh trong ô nhập tab AI; trang Tools giữ làm thư viện | Home, Editor AI, R3/R6 |
| Panel AI liệt kê layer của canvas để nhắc tới khi sửa | **Lấy** dưới dạng chip `@ layer` trong ô nhập + Layers panel thật ở rail | Editor AI, R4/R5 |
| Kết quả edit hiện thumbnail trong chat + nút "Add to canvas" | Đã có (A1). Cải thiện: nhãn nút nói rõ layer sẽ bị thay | Editor AI |
| Checklist "Planner Agent ✓ · Designer Agent ✓ · Manager Agent ✓" | **Không lấy**: seller không cần biết tên agent; giữ động từ người dùng hiểu (Planning / Painting / Composing) | R3 |
| Credit subscription, trừ credit ngầm | **Không lấy** (BYOK, D-series): giá hiện trước mỗi hành động tốn quota + đồng hồ quota hôm nay | R1, R3 |
| Không thấy layers panel / inspector cố định — chỉnh qua hội thoại + toolbar nổi trên ảnh | **Làm khác**: Layers + tab Design là xương sống (luật DNA #2); toolbar nổi theo selection vẫn có | R4, R5 |

## Rủi ro

- **Editor.tsx đã gần 1 200 dòng:** R4–R5 nên tách `LayersPanel`, `Inspector`, `ContextToolbar` thành component riêng thay vì nhồi tiếp.
- **Undo/redo + autosave** phải bắt được mọi thay đổi từ inspector/Layers (bài học #4 của design-direction: text property changes từng không vào history).
- **Seller validation (D10) chưa chạy:** đổi khung trước D10 nghĩa là D10 kiểm tra UI mới — tốt cho chất lượng dữ liệu, nhưng trễ D10 thêm. Owner quyết (Q4).
- **Windows:** sidebar + vùng kéo phải kiểm trên Windows thật (gate T6) — chrome mac và Windows khác nhau.

## Câu hỏi cho owner

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Sidebar trái thay top nav? | Có (UX-1) — chỗ cho New, trạng thái runtime và quota; top nav hiện không có chỗ cho chúng |
| Q2 | For agents rời nav chính vào Settings? | Có — seller không dùng; dev vẫn vào được trong 2 click |
| Q3 | Panel phải Editor: tab Design \| AI, hay inspector nổi riêng? | Tab — một panel, không che canvas, giữ chỗ cho A1/A3 |
| Q4 | Làm R1–R6 trước hay sau buổi seller (D10)? | R1–R3 trước D10 (rẻ, không đụng canvas, sửa đúng các triệu chứng seller thấy đầu tiên); R4–R6 sau, ưu tiên theo dữ liệu D10 |
| Q5 | Đổi tên Workspace → Projects? | Có — đúng thứ người dùng tìm |
| Q6 | Brand pill vào composer ngay (E1-a) hay chờ E1 đầy đủ? | Ngay — chỉ là UI chọn `brandKitId` đã có trên wire; tác động lên text layers (E1-c) để doc riêng |
| Q7 | Chip trên composer là "làm gì" (use case) thay cho chip kích thước? | Có — khớp cách seller nghĩ ("làm flash sale") và cách đối thủ tham chiếu làm; kích thước vẫn chọn được trong pill |
| Q8 | Đưa Skills vào composer + tab AI (A2-nhóm D của brainstorm)? | Có, bản tối thiểu: menu gọi tool sẵn có, không thêm tool mới |
| Q9 | Áp hệ thị giác v2 — đổi nút chính từ tím sang mực, tím chỉ còn cho AI/vùng chọn, chrome `#f3f2ef`? Đây là sửa `design-direction.md` (hiện ghi violet là accent chung) | Có — tím dùng cho mọi thứ là lý do lớn nhất UI trông như boilerplate; cập nhật `design-direction.md` cùng PR R1 |
