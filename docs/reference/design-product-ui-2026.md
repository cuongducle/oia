# Vì sao UI chưa phải "sản phẩm thiết kế" — nghiên cứu đối thủ 2026

* **Ngày:** 2026-10-30
* **Phạm vi:** chẩn đoán UI desktop hiện tại (shot thật 2026-10-30) + bằng chứng đối thủ (SurgePix RE sẵn có, Canva glow-up editor, Photroom web REA mới, Adobe contextual task bar) → rút ra DNA "sản phẩm thiết kế" và danh sách gap ưu tiên cho Oia.
* **Tình trạng:** research — chưa phải quyết định. Là đầu vào cho một vòng thiết kế lại UI (không chạm wire contract, không đổi ngôn ngữ UI theo D8).
* **Ghi chú pháp lý:** chỉ học pattern/ cấu trúc tương tác; không sao chép asset, tên, layout y hệt của đối thủ.

---

## 1. Chẩn đoán UI Oia hiện tại (từ shot thật, phân tích vision)

### Home (`out/desktop-home.png`)
Phán quyết thẳng: **"chat app có landing page gắn lên trên"** — không phải công cụ thiết kế.

| # | Triệu chứng | Chi tiết |
|---|---|---|
| 1 | **Kết quả nằm trong transcript chat** | ảnh banner đến như "message" giữa các dòng progress text — thay vì trên artboard/canvas card. Đây là quyết định làm hại nhất. |
| 2 | **Log agent thô hiển thị làm UI** | "Designer Agent - done / Image Generator - done" = output CLI màu xám, không icon/trạng thái/thiết kế. |
| 3 | **Infra lộ trên hero** | card "Codex is ready · 0.166.0 · ChatGPT" + toggle Auto/Codex/Trial + Sign out nằm ngay dưới ô prompt — plumbing backend chiếm vị trí đẹp nhất trang. |
| 4 | **Không có design-tool chrome** | không rail trái, không toolbar, không panel — một cột ~800px stacked cards = web form. |
| 5 | **Nhìn như shadcn mặc định** | viền 1px xám + radius 12 đều nhau + chữ xám-trắng — chữ ký của app boilerplate. |
| 6 | **CTA yếu** | nút gửi = mũi tên tròn tím nhỏ không nhãn; không có nút "Create" chính. |
| 7 | **Hierarchy chữ lẫn lộn** | serif editorial cạnh status text xám nhỏ — system chatter và user content cùng trọng số. |
| 8 | **Gallery_symbols tượng trưng** | 4 thumbnail, không filter theo nền tảng/kích thước (Shopee/TikTok), không recent designs. |
| 9 | **Sản phẩm tự làm hỏng uy tín** | banner output "GIAM GIA 20%" (mất dấu tiếng Việt!) chữ Helvetica đậm trên nền tím phẳng — sản phẩm thiết kế mà chính sample của nó xấu nhất màn hình. |

### Editor (`out/desktop-editor.png`)
**"AI chat wrapper có canvas gắn vào"** — thiếu tầng chỉnh sửa tất định (deterministic).

| # | Thiếu gì | Đối thủ có gì |
|---|---|---|
| 1 | **Properties inspector / contextual toolbar** — không có chỗ nào điền X/Y/W/H, rotation, fill, font size… | Canva: quick actions toolbar theo selection; Adobe: Contextual Task Bar nổi theo selection |
| 2 | **Layers panel** — @-mention được layer mà không có chỗ nào thấy layer list | Figma/Canva đều surface layers; với Fabric.js thì layer stack là object model tự nhiên |
| 3 | **Rail trái = launcher, không phải workspace** — không active state, không panel ghim cạnh rail | Canva: hover preview, click pin; tab active highlight |
| 4 | **Uploads không nằm rail** — việc #1 của seller là thêm ảnh sản phẩm | Canva/Photroom: Uploads/DropZone prominence |
| 5 | **Artboard không có affordance** — không tên/kích thước trên artboard, shadow yếu, không selection outline | Figma: frame name + dims trên artboard |
| 6 | **Zoom 29% mặc định thay vì auto-fit** | mọi editor auto-fit khi mở |
| 7 | **AI panel 70% khoảng trắng chết** — không variants grid, không history thumbnails | SurgePix: 3 biến thể/lần + timeline; Photroom: carousel kết quả |
| 8 | **Settings nằm trong rail content** — IA lẫn lộn app chrome với content | mọi tool: settings ở avatar menu top-right |

## 2. Bằng chứng đối thủ

### A. Photroom web (REA bundle + screenshot, 2026-10-30)

**Phương pháp:** Chrome headless CDP + `rea analyze-web-bundle` (evidence `ev_77669d2c...`, 132 script) + `rea capture-web-screenshot`. Bundle: **Vite + React**, engine render = **WASM WebGL riêng** (`libphotoroom_engine_webgl-*.wasm` — không dùng Fabric).

**Kiến trúc UI lộ từ tên chunk** (lazy route theo surface): `create.lazy`, `batch.lazy`, `brand-library.lazy`, `ai-tools.lazy`, `product-catalog.index.lazy`. Component kit tự làm (không UI library ngoài): `NavigationBar, Tabs, Slider, SwitchGroup, RadioGroup, InlineColorPicker, VisualToolTile, InsertViewImageTile, DropZone(+Fullscreen), MaskEditor, MagicRetouch, EditorUndoRedo/UndoRedoStore, VirtualModelGrid, RecommendedGroupCarouselList, useFuse (fuzzy search), useFocusKeyNav, ToastProgress, ConfirmModal`. Tích hợp seller thật: **EtsyConnectButton, EbayConnectButton, Shopify Products** (nav). Engagement: Braze, AppPromoBanner, Usage meter, gradient Pro upsell (gradient duy nhất dành cho monetization).

**Launcher home (screenshot):** dark SaaS chrome gần đen; sidebar trái icon+label với ⌘K search, nav + section "Content" (Designs, Brand Library, Templates) + **Usage gauge + Upgrade Pro neo đáy**; content = **grid tool card 5 cột** ("Start from a photo" được ưu tiên bằng outline tím — canonical entry), rồi **task card dẫn bằng sample thật** (ảnh sneaker trên nền checkerboard trong suốt = demonstrate kết quả, không mô tả tính năng), carousel video. Sign-in chỉ chặn khi commit. Từ vựng chuyên ngành vertical: Ghost Mannequin, Product Staging, AI Fashion Models, Batch.

**Bài học cho Oia:** home là **launcher chọn cách tạo** (tool/task/template), không phải chat form; kết quả demo bằng ảnh THẬT chất lượng cao; vocabulary của niche (seller e-commerce) tạo cảm giác "pro tool" nhiều hơn mọi hiệu ứng; dark chrome + 1 accent + gradient chỉ cho monetization.

### B. Canva "glowed up" editor (help docs chính thức, 2025→2026)

- **Toolbar dưới header = quick actions toolbar**: đổi theo phần tử đang chọn (image → crop/filter/effects; text → font/size/style). Nút `>>` cuối bar mở **Edit panel** (panel ngữ cảnh đầy đủ).
- **Side panel redesign**: Templates, Elements, Text, Brand, Draw, Projects, Apps — **hover để xem nhanh, click để pin**; click tab lần nữa đóng.
- **Homepage**: side menu + Quick Create (search template) + starred sections + contextual notifications.
- **Header**: mode switcher Edit/Comment/View; undo/redo; Share là CTA chính cạnh Export.
- Bài học: **mọi control gắn với selection**; panel không chiếm chỗ khi không cần; Share/Export là first-class.

### C. Adobe (Photoshop/InDesign/Express): Contextual Task Bar

Thanh nổi **trên canvas, cạnh selection**, hiện đúng action theo ngữ cảnh (add object, selection options, import…). Xác nhận pattern ngành: contextual > modal; nổi gần đối tượng > panel xa.

### D. SurgePix (RE sẵn có — `docs/private/surgepix-reverse-engineering.md`)

Đối thủ trực tiếp nhất (mô hình Oia học theo): prompt-first home, **3 biến thể/lần sinh**, timeline Designer Agent → Image Generator (bị Oia render thô thành log — chính SurgePix cũng chỉ đến mức này), editor kiểu Canva (rail đầy đủ + AI chat phải với @-mention + inpainting bằng prompt). Điểm yếu của họ = cơ hội: không chọn model, layer separation marketing hơn thực tế, font-size state lệch.

## 3. DNA "sản phẩm thiết kế" — 7 luật rút ra

1. **Canvas là hero.** Kết quả đến trên artboard/canvas card (có tên + kích thước + nút Edit nổi bật), không bao giờ trong transcript chat.
2. **Tầng chỉnh sửa tất định là xương sống.** Inspector/contextual toolbar theo selection + layers panel. AI là complement (nhanh, gợi ý), không phải cổng duy nhất để đổi một cái màu.
3. **Home = launcher.** Chọn cách tạo (tool card / task card dẫn bằng kết quả thật / template / recent) — không phải một ô chat trống giữa trang.
4. **Chrome chuyên nghiệp trọn bộ:** rail trái có active state + panel ghim; top bar đủ undo/redo/Share/Export; auto-fit zoom; ⌘K; usage/quota meter; settings ở menu hệ thống, không trong rail content.
5. **Trình bày kết quả là sản phẩm demo của chính nó:** variants grid, progress được thiết kế (skeleton/step states), sample thật chất lượng cao — seller phán xét app bằng banner đẹp nhất mà app từng xuất.
6. **Từ vựng niche = cảm giác pro tool:** Photroom có Ghost Mannequin; Oia phải có Shopee banner, TikTok Shop, flash-sale, giá giảm %… (UI vẫn EN theo D8 — vocabulary nội dung seller).
7. **Trust signals:** autosave nhãn rõ + version, export pre-flight, marketplace presets hiện diện ở đúng chỗ (kích thước), quota/usage hiển thị như Photroom Usage gauge.

## 4. Gap table và thứ tự ưu tiên cho Oia

| Ưu tiên | Gap | Làm gì | Đối chứng |
|---|---|---|---|
| **P0** | Kết quả trong transcript | Result → **canvas card**: tên + dims + "Open in editor" chính + variants ngang; progress = step states có icon (Che ngừng render text log thô) | SurgePix 3-variant, Photroom carousel |
| **P0** | Không inspector/contextual | **Quick actions toolbar** dưới topbar đổi theo selection (text → font/size/màu; image → thay ảnh/crop/aspect); số hoá X/Y/W/H/rotation ở panel phải | Canva quick actions, Adobe task bar |
| **P0** | Không layers panel | Layers list (thứ tự Fabric objects, đổi tên, ẩn/hiện, khoá, kéo đổi thứ tự) + hoà @-mention hiện có | Figma/Canva |
| **P1** | Home là chat form | Home → launcher: recent designs + template grid theo nền tảng VN (Shopee/TikTok/Lazada sizes) + task card dẫn bằng kết quả thật; prompt composer vẫn ở giữa nhưng không còn là cả trang | Photroom launcher |
| **P1** | Rail không phải workspace | Tab active highlight + panel ghim cạnh rail; thêm **Uploads** lên đầu rail; Settings rời rail → menu app | Canva side panel |
| **P1** | Artboard yếu + zoom 29% | Auto-fit khi mở; frame label tên + kích thước; selection outline + handles rõ; snap/guides tối thiểu | Figma frames |
| **P2** | CTA yếu / shadcn mặc định | Nút "Create" nhãn rõ; token hoá kiểu chữ (chrome 12–13px vs content); icon set thống nhất nét 1.5–2px | design-direction.md đã có direction, chỉ cần thực thi triệt để |
| **P2** | Sample tự làm xấu | Sample/template trong app phải là banner đẹp nhất (đúng dấu tiếng Việt, có ảnh sản phẩm thật, hierarchy giá/CTA) | — (bài học tiêu cực của chính mình) |
| **P2** | Thiếu trust signals | Quota usage gauge (đã có counter — surface kiểu Photroom), autosave + "Saved at", export pre-flight | Photroom Usage |

**Không làm** (giữ nguyên ranh giới chiến lược hiện có): không thêm mask studio vẽ tay (SurgePix cũng không có — Non-Goal TP.9); không share/collab đa người (desktop, 1 người); không đổi hướng "editorial studio" của `design-direction.md` — bảng này là về **cấu trúc**, không phải bảng màu.

## 5. Nguồn

- REA Photroom web (bundle + screenshot, evidence `ev_77669d2cab37b23006d6b9234658b330887a8a34553713ff3645da16c514fa08`): `https://app.photoroom.com/create`, Chrome headless CDP; dump chunk + screenshot lưu [`evidence/photroom-*-2026-10-30.*`](evidence/) (cùng thư mục).
- Canva Help — Get to know the glowed up editor and homepage: https://www.canva.com/help/glow-up-variantb
- Adobe — Contextual Task Bar (InDesign, 2026-08): https://helpx.adobe.com/indesign/desktop/get-started/toolbox/use-contextual-task-bar.html ; tổng quan: https://helpx.adobe.com/help/premiere-elements/desktop/workspace-and-workflow/contextual-task-bar.html
- SurgePix RE (nội bộ, 2026-10-27): [`surgepix-reverse-engineering.md`](../private/surgepix-reverse-engineering.md)
- Shot Oia: `apps/desktop/out/desktop-home.png`, `desktop-editor.png` (DESKTOP_SHOT 2026-10-30, mock pair)
