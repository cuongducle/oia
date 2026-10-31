# Feature brainstorm từ đối thủ tham chiếu (capability-level)

* **Author:** cuongducle + agent
* **Date:** 2026-10-31
* **Status:** Proposed — v1.1 feature candidates. Đã chốt (kèm spec trong mục tương ứng): **A1, C1, C3, B1**. Còn lại là candidate chưa chốt. Doc này KHÔNG phải kế hoạch triển khai: mỗi feature P0 **tốt nghiệp thành design doc riêng** theo khuôn Goals/Non-Goals/CUJ/TP/gates — decisions sống ở đây cho tới lúc đó. **Update 2026-10-31 (owner): v1.1 triển khai ngay, không chờ D10 — sequencing cũ bị ghi đè. A1 tốt nghiệp → [`variant-preview-apply.md`](variant-preview-apply.md) (ĐÃ SHIP); C1 tốt nghiệp → [`outline-gate.md`](outline-gate.md) (ĐÃ SHIP 2026-10-31); C3 tốt nghiệp → [`live-overlay-presets.md`](live-overlay-presets.md) (DESIGN 2026-10-31, triển khai ngay — owner chốt "chốt hết theo đề xuất" cùng ngày: cả 2 nền tảng guides từ đầu, B1 làm sau C3, không thăng cấp candidate nào). Chi tiết từng feature sống ở doc riêng từ lúc tốt nghiệp.**
* **Branch:** `cuongducle/docs-feature-brainstorm`
* **Phạm vi:** đối thủ trực tiếp nhất (cùng thesis prompt-first → layer editor, đang chạy web + credit subscription) nghiên cứu ở mức **tính năng/capability** từ trang công khai + phân tích vision 6 ảnh minh họa + RE nội bộ của owner (private, 2026-10-27 — mức UI/protocol, không lặp ở đây) + gap table `docs/reference/design-product-ui-2026.md` (mức cấu trúc UI, không lặp). Theo precedent bảo mật đối thủ: tên sản phẩm, URL, bundle KHÔNG ghi trong repo công khai.

## 1. Đối thủ tham chiếu hôm nay là gì (tóm tắt từ trang công khai)

Mô hình: web app, credit subscription (Basic 0,99 → 9,90 USD/tháng ≈ 130 ảnh; Pro 4,99 → 24,90 USD ≈ 750 ảnh), sinh ảnh bằng GPT-Image-2, thông điệp chính: tạo bằng chữ, hoàn thiện bằng layer editor — cùng thesis với Oia (prompt-first → editor layer), nhưng hosted credits, còn Oia là desktop BYOK.

9 feature họ quảng cáo: Latest AI Image Models (text-to-image, image-to-image, reference-guided) · Planner Agent · Design Agent · Smart Layer Separation · Conversational Editing · Precision Control · Brand Binding · Preset Skills · Import Files.

2 use case được làm video riêng: **Live Commerce Graphics** (overlay PNG đúng kích thước cho TikTok Shop/Douyin, đổi sản phẩm/đổi giá qua hội thoại) và **Narrative Infographics** (ảnh dài kể chuyện, text render "chính xác").

Quanh lõi: **Explore gallery** công khai (deck nhiều trang 12–30 slide, hiện cả số credit từng tác phẩm đã tốn), **prompt library** cập nhật hằng ngày (mồi SEO), footer dày tool SEO (converter, chart maker).

## 2. Bài học rút từ ảnh (vision phân tích 2026-10-31)

| # | Ảnh | Pattern quan sát được | Đáng mượn? |
| --- | --- | --- | --- |
| P1 | Conversational Editing | **Preview-before-apply**: kết quả edit hiện thumbnail TRONG chat, canvas giữ nguyên, nút "Add to canvas" mới áp. Pipeline hiển thị checklist Planner → Designer → Manager, mỗi bước mở rộng được. Selection box trên canvas trỏ đúng object bị edit ("the cake"). | ✅ Mạnh nhất — khớp nguyên tắc no-silent-fallback của Oia |
| P2 | Planner Agent | Plan hiển thị thành **task timeline card** trong luồng chat (First/Second…), không phải log thô. | ✅ (trùng hướng gap P0 đã ghi ở design-product-ui-2026) |
| P3 | Brand Binding | Brand kit là **parameter cấp request** — pill dropdown ngay cạnh ratio/resolution trong composer, không nằm settings xa; kit gồm palette + font specimen + logo trên grid. | ✅ Oia đã có brand kit — thiếu chỗ đứng trong composer + tác động lên text layers |
| P4 | Preset Skills | **Capabilities-as-chips** gắn vào ô nhập: tên verb-first (Maker/Translator/Remover/Resizer), một click khởi động luồng, không cần viết prompt. | ✅ Oia đã có skills + toolbox — học cách đặt tên/tiết kiệm bước |
| P5 | Smart Layer Separation | Ảnh marketing KHÔNG có layers panel — kết quả tách trình bày là các artboard card rời; trái tim là remove-bg + tách object. | ⚠️ Marketing hơn thực tế (đồng thuận RE trước); nếu mượn thì làm phiên bản trung thực hơn |
| P6 | slide deck "premium" | Chữ cỡ lớn/headline render sạch, **chữ nhỏ (body, axis label, footer) garble** — điểm yếu cố hữu của image-model-render-text. | ❌ Không mượn cách làm; đây là **đòn counter-play** cho clean-plate + native text của Oia |

## 3. Đối chiếu nhanh: đối thủ ↔ Oia hiện có

| Khả năng | Đối thủ | Oia hôm nay | Kết luận |
| --- | --- | --- | --- |
| Prompt-first home | ✅ | ✅ | ngang |
| Planner structured copy | ✅ (Planner Agent) | ✅ CodexLlmProvider `blocks[]` | ngang — cách hiển thị còn thua (P2) |
| Sửa text không regenerate | ⚠️ mờ (layer separation marketing) | ✅ native text layers (clean-plate) | **Oia thắng** — cần kể chuyện này |
| Ảnh sản phẩm thật làm reference | ✅ (image-to-image) | ✅ reference-first (G8) | ngang |
| Edit hội thoại có preview duyệt | ✅ Add-to-canvas | ⚠️ có AI dock + @-mention, chưa có preview-apply | **gap → A1** |
| Brand kit | ✅ bind vào chat/project | ✅ có kit; chưa áp vào composer + text layers | **gap một phần → E1** |
| Preset skills | ✅ chips verb-first | ✅ skills + toolbox | nâng cấp trải nghiệm (A2 nhóm D) |
| Đa trang | ✅ Auto Pages, deck 12–30 slide | ✅ page count + PPT tool | thiếu **outline gate** → C1 |
| Overlay live commerce | ✅ use case chính | ❌ (chỉ marketplace size presets) | **gap → C3** |
| Ảnh dài narrative | ✅ | ❌ | **gap → C2** |
| Prompt/recipe library | ✅ daily, SEO | ❌ | **gap → D1** (bundled, không cần server) |
| Import file cũ iterate | ✅ | ⚠️ có import project + paste ảnh (G7) | nâng cấp thành luồng chính → B2 |
| Gallery công khai | ✅ hosted | ❌ desktop-only, không server | KHÔNG mượn (chỉ "featured examples" bundled nếu muốn) |
| Credits/subscription | ✅ | ❌ BYOK là nguyên tắc sản phẩm | KHÔNG mượn |

## 4. Đề xuất feature (brainstorm — chưa chốt)

### Nhóm A — Vòng lặp chỉnh sửa hội thoại

**A1. Preview-before-apply cho mọi edit qua chat** (`Add to canvas` pattern, P1) — **Q1 ĐÃ CHỐT (owner, 2026-10-31)**

Edit bằng chat sinh **variant mới** (không đè canvas) → variant nằm trong khay của conversation → người dùng chọn lúc nào áp. Ba luật cứng ràng buộc thiết kế: no-silent-fallback, quota-is-money (G3), records-must-not-lie (B7).

*Luồng chi tiết:*
1. Trong editor, người dùng chọn artwork layer (hoặc nhắm qua @-mention — A3) rồi gõ lệnh edit trong AI dock.
2. Pre-flight hiển thị "sẽ đốt 1 ảnh" + nút Cancel thường trực; mỗi variant là đúng một job metered-once, không silent retry. Mặc định 1 ảnh/lần; "Generate 3" giữ opt-in có kiểm budget (đã chốt ở gap P0 design-product-ui-2026).
3. Generation chạy với artwork hiện tại làm reference image (G8); kết quả về **khay variant trong AI dock** — canvas giữ nguyên tuyệt đối.
4. Variant card: thumbnail + mô tả thay đổi + 3 hành động:
   - **Replace selected layer** (primary — điểm khác biệt hóa, đối thủ KHÔNG có): variant thay đúng layer artwork đang chọn; mọi text layer/manual layer giữ nguyên vị trí. Đây là loop "sửa một chỗ, không mất phần đã ưng".
   - **Open in editor**: mở project mới từ variant (mirror "Edit as project" của đối thủ — Oia đã có nút này).
   - **Not now**: ẩn card khỏi dock; **asset không bị xóa** — copy trung thực vì nó không hủy gì.
5. Persistence: variant persist vào file store theo asset ID (G5), gắn với conversation; **không auto-cleanup** — xóa thật chỉ khi xóa project/conversation (đĩa local, không áp lực dọn kiểu server; policy "giữ N cái" = orphan paid generation, cấm). Job feed hiển thị variant tồn tại (B7).

*Bằng chứng đối thủ xác nhận mô hình:* RE nội bộ 2026-10-27 §6 — container của variant là conversation (chat cũ mở lại vẫn còn ảnh), menu mỗi ảnh Preview/Edit/Inpainting/Download/Export/**Edit as project**; "Discard" của họ cũng không xóa ảnh. §7 bug #3: nút "Add to chat" từng disabled không rõ lý do — flow preview-apply của họ không ổn định, Oia phải làm chắc hơn. KHÔNG mượn: mặc định 3 ảnh/lần (đốt 3 credit/bấm) và kiểu mỗi-variant-là-project-mới-rời-rạc.

Chi phí: vừa (AI dock + variant storage + apply flow). Rủi ro: partial-edit cần reference-image pipeline đã có (G8) — không cần provider mới.

**A2. Plan card & step states** *(candidate — chưa chốt, xem lại cùng dữ liệu D10)* (P2 — trùng gap P0 cũ): planner `blocks[]` + tiến trình render thành card có icon theo stage (Planning → Painting → Composing), mỗi bước expand được. Không đề xuất thêm gì ngoài gì đã ghi — chỉ nhấn: đối thủ cũng dừng ở mức này, Oia có lợi thế cấu trúc `blocks[]` đã typed.

**A3. Selection-bound edit** *(candidate — chưa chốt, xem lại cùng dữ liệu D10)*: đang chọn layer nào thì instruction "đổi cái này thành muffin" bind vào layer đó (đối thủ dùng selection box để giải "the cake"). Oia đã có @-mention — nâng cấp: @-mention tự suy ra từ selection, và selection highlight hiển thị target trước khi submit.

### Nhóm B — Đưa ảnh cũ vào vòng lặp

**B1. "Deconstruct" khi import ảnh** (học P5 nhưng không overclaim) — **Q4 ĐÃ CHỐT (owner, 2026-10-31): AI-first như đối thủ + lane miễn phí làm degradation**

Paste/upload banner cũ (làm từ Canva/ChatGPT) → hồi sinh thành bản chỉnh sửa được. KHÔNG hứa tách từng object như đối thủ quảng cáo — chỉ trích chữ + làm sạch, phần còn lại là ảnh phẳng (trung thực).

*Luồng chính (AI path — mọi bước hiện giá trước khi chạy):*
1. Upload/paste ảnh cũ → **vision model đọc chữ** (nội dung + vùng vị trí) — 1 lượt.
2. **"Làm sạch vùng chữ"**: image-edit inpaint xóa text khỏi ảnh gốc, giữ mọi thứ khác — 1 ảnh (pipeline `ai-edit` + reference đã có).
3. Text layers đặt trên nền sạch — sửa tự do 0 phí từ đây; giải quyết always bài toán "chữ ma" của bản tesseract hiện tại.
4. Tổng chi phí hiển thị trước khi chạy: "≈ 1 ảnh + 1 lượt đọc"; cancel thường trực; các lần deconstruct/edit gom vào một session (khớp khay variant A1).

*Bằng chứng đối thủ:* API 12 task của họ KHÔNG có task OCR nào (RE nội bộ §4) — tool "AI Image Editor" của họ = vision đọc + inpaint qua server, đốt credit mỗi lần, không có lane free. Oia làm cùng flow nhưng (a) chi phí là quota của người dùng nên mọi bước hiện giá tường minh thay vì tự trừ, (b) **giữ lane miễn phí họ không có**: tool tesseract `eng+vie` ĐÃ SHIPPED (gate nightly `ocr-nightly.yml`) tái định vị thành "Đọc thô 0 phí" theo pattern G7 — bật khi hết quota/không có kênh, đọc yếu hơn nhưng định vị bbox đáng tin; nó cũng là nguồn bbox dự phòng nếu model trả vị trí kém.

*Spike khi implement:* cơ chế lấy vị trí (model trả bbox vs tesseract chỉ để định vị + model đọc nội dung) — quyết định sau spike, không chốt trước trong doc này.

**B2. "Bring your ChatGPT image" thành luồng chính** *(candidate — chưa chốt; phần lớn ý định đã được B1 chốt phủ)*: G7 paste ảnh hiện là degradation lane — nâng cấp thành luồng được gắn nhãn rõ (button "Từ ảnh ChatGPT") kèm deconstruct B1. Đối tượng: seller đã quen dùng ChatGPT web, Oia là nơi *hoàn thiện* chứ không nhất thiết *sinh*.

### Nhóm C — Đa trang & định dạng ngách

**C1. Outline gate trước khi trả tiền cho deck nhiều trang** (học "Auto Pages" nhưng thêm kiểm soát quota) — **Q2 ĐÃ CHỐT (owner, 2026-10-31, sau 2 vòng thảo luận): mặc định BẬT + có switch tắt**

Trước khi sinh N trang: planner trả outline (tiêu đề + tóm tắt mỗi trang, text-only turn — rẻ) → hiện **outline card** → người dùng duyệt/sửa/bớt trang → CHỈ SAU ĐÓ mới burn quota từng trang. Áp dụng cho **mọi generation nhiều trang (từ 2 trang)**; banner 1 ảnh không có khái niệm outline nên không dính gate.

*Chi tiết chốt:*
1. **Mặc định bật, switch tắt "Duyệt outline trước khi sinh"** (nhớ lựa chọn của người dùng). Tắt = AI tự duyệt plan và chạy thẳng — pipeline VẪN có outline (đi kèm từng trang khi sinh để giữ mạch nội dung), chỉ không chờ người dùng. Lý do mở switch (owner): phục vụ nhiều tệp user — người tin AI/đi nhanh bỏ qua bước, người cẩn thận giữ gate; AI plan tốt hiện nay, không ép duyệt. Lý do mặc định bật: chi phí Oia là quota ChatGPT vô hình (đối thủ thấy credit trừ ngay nên không cần gate), và lỗi planner là rủi ro thật — đối thủ từng tự dịch prompt người dùng sang SAI ngôn ngữ (RE nội bộ §7 bug 1); outline card là nơi bắt lỗi đó trước khi tốn ảnh.
2. **Gate không được thành bài tập** (bài học từ việc đối thủ để opt-in): outline card là "đọc lướt 5 giây + 1 click đi tiếp" — nút chính sẵn sàng "Sinh N trang"; muốn kỹ thì sửa tiêu đề từng trang, thêm/bớt trang, kéo đổi thứ tự ngay tại card.
3. **Nhãn chi phí là luật chung, độc lập gate**: mọi submit nhiều trang hiện "N trang ≈ N ảnh" cạnh nút sinh.
4. **Job theo trang**: deck N trang = N job metered-once con, không phải 1 job khổng lồ — cancel giữa chừng dừng đúng chỗ, trang đã sinh vẫn giữ (khớp CUJ 4).
5. **Pipeline**: (1) text-only outline turn → (2) duyệt (hoặc bỏ qua nếu switch tắt) → (3) sinh ảnh từng trang theo outline đã duyệt.
6. **Điểm kiểm chứng D10**: nếu seller thật trong buổi validation click xuyên outline card mà không đọc, đó là bằng chứng gate vô giá trị với đối tượng này — đổi default theo dữ liệu, không theo giả định.

**C2. Long-image narrative (ảnh dài XHS/blog)** *(candidate — chưa chốt, xem lại cùng dữ liệu D10)*: artboard dài + cột text native theo khối — dùng thế mạnh text sạch của Oia, dùng image model chỉ cho nền/illustration từng đoạn. Mục tiêu ngách: bài review/product-story dài cho Xiaohongshu/RED và blog seller.

**C3. Live-commerce overlay presets** — **Q3 ĐÃ CHỐT (owner, 2026-10-31): preset trung thực + safe-zone guides** — *tốt nghiệp → [`live-overlay-presets.md`](live-overlay-presets.md) (2026-10-31); chi tiết sống ở doc riêng*

Bộ preset export mới cho seller livestream (TikTok Shop/Shopee Live VN) + template pack đi kèm; đổi giá/đổi chữ qua A1/A3, không regenerate. Use case này đối thủ chọn làm video demo đầu tiên = nhu cầu thật của khán giả chung.

*Chi tiết chốt (kết quả researched 2026-10-31):*
1. **Preset "Livestream overlay 9:16"** — canvas 1080×1920 (thực tiễn OBS, không phải "spec platform"), nền trong suốt, export PNG trong suốt.
2. **Safe-zone guides là feature chính** — overlay hiện vùng nền tảng thường che (đầu: đếm người/comment; đáy: product cards/follow; hai bên nút nền tảng), bật/tắt được, KHÔNG bao giờ xuất ra file. Số liệu zone cụ thể theo nền tảng (TikTok ≠ Shopee) = việc researched riêng khi implement — doc này không hứa số liệu.
3. **Preset từ spec chính thức thật**: ảnh bìa buổi live Shopee 500×500 (1:1), ảnh bìa TikTok 1080×1920.
4. **Template pack overlay**: giá flash sale, badge freeship, countdown — text là native layers.
5. **Luật UI copy**: KHÔNG viết "kích thước platform yêu cầu" cho overlay — không tồn tại spec công khai nào (TikTok Shop/Shopee Live không yêu cầu kích thước sticker; lời quảng cáo "exact dimensions required" của đối thủ là màu marketing). Thông điệp bán: "đừng để đồ quan trọng bị UI nền tảng che".

### Nhóm D — Học bằng ví dụ, không cần server

**D1. Recipe library đi kèm app (bundled)** *(candidate — chưa chốt, xem lại cùng dữ liệu D10)*: thay "prompt library daily updated" của đối thủ (cần server) bằng recipes tĩnh theo ngách VN được đóng gói theo app (flash sale 2.2, livestream hôm nay, menu quán, CV…), mỗi recipe = prompt mẫu + kit gợi ý + kết quả mẫu thật. Cập nhật theo release, không phải hằng ngày — đánh đổi trung thực cho desktop-only.

**D2. Featured examples gallery (bundled)** *(candidate — chưa chốt; cân nhắc sau D1)*: bản desktop của Explore gallery — một màn "Xem người khác làm gì" với tác phẩm mẫu + "mở prompt này". Không có tác giả thật, không đếm credit — chỉ educational. (Cân nhắc sau D1; giá trị social proof thấp hơn khi không có cộng đồng thật.)

### Nhóm E — Brand

**E1. Brand kit ràng buộc cả chuỗi** *(candidate — chưa chốt, xem lại cùng dữ liệu D10)*: (a) pill chọn kit ngay composer (chứa không chỉ ở advanced), (b) khi generate: palette/logo từ kit đi vào reference prompt, (c) text layers sinh ra dùng font của kit + copy zones nhận màu kit, (d) canvas card hiển thị "Brand: <tên kit>". Oia đã có store brand kit đầy đủ — phần thiếu là **tác động thực** của kit lên kết quả, đúng nghĩa "binding" của đối thủ.

## 5. Không mượn gì, và tại sao

* **Credits/subscription, upsell badge, fabricated reviews** — vi phạm nguyên tắc BYOK và "no invented users/ratings" (design-direction.md).
* **Explore gallery hosted công khai** — cần server + tài khoản; desktop-only là quyết định D-series đã chốt. Bản bundled D2 là giới hạn an toàn.
* **SEO tool footer** (converter/chart maker rời) — chiến lược web traffic, không phải sản phẩm.
* **Tách layer kiểu marketing** (mỗi object một artboard bay lên) — overclaim; B1 làm bản trung thực.
* **Render text bằng image model cho body text** — điểm yếu P6; Oia giữ clean-plate + native text.

## 6. Đề xuất thứ tự ưu tiên (draft, chờ owner)

| Mức | Feature | Lý do xếp |
| --- | --- | --- |
| P0 | A1 preview-apply · C1 outline gate | Nâng chất loop đã validate mà không cần năng lực mới; C1 là khác biệt hóa đối thủ (chi phí đoán được) |
| P1 | A3 selection-bound · E1 brand binding · C3 live overlay presets · D1 recipe library | Giá trị seller rõ, chi phí vừa, không đụng provider |
| P2 | B1+B2 deconstruct import · C2 long-image | B1 đã chốt kiến trúc (Q4) nhưng phụ thuộc spike vị trí; làm sau khi loop chính chắc |

## 7. Câu hỏi đã chốt

* ~~Q1: A1 — variant lưu ở đâu?~~ **ĐÃ CHỐT (2026-10-31):** khay variant trong AI dock gắn với conversation, asset persist theo G5, không auto-cleanup, "Not now" thay cho Discard; hành động khác biệt **Replace selected layer**; "Open in editor" làm hành động phụ. Chi tiết trong mục A1.
* ~~Q2: C1 — outline gate mặc định bật khi nào?~~ **ĐÃ CHỐT (2026-10-31, 2 vòng):** mặc định BẬT cho mọi generation nhiều trang (≥ 2 trang) + **switch tắt** nhớ lựa chọn (tắt = AI tự duyệt, pipeline vẫn dùng outline nội bộ); nhãn chi phí "N trang ≈ N ảnh" là luật chung; deck = N job metered-once con theo trang; checkpoint D10 theo dõi click-through mù. Chi tiết trong mục C1.
* ~~Q3: C3 — spec overlay lấy chuẩn nào?~~ **ĐÃ CHỐT (2026-10-31):** preset trung thực + safe-zone guides. Không có spec sticker công khai — canvas 9:16 OBS + guides vùng nền tảng che là feature chính; chỉ preset ảnh bìa (Shopee 500×500, TikTok 1080×1920) là spec chính thức. Cấm UI copy "kích thước platform yêu cầu". Chi tiết trong mục C3.
* ~~Q4: B1 — OCR local hay qua model?~~ **ĐÃ CHỐT (2026-10-31):** AI-first như đối thủ — vision đọc chữ (1 lượt) + inpaint làm sạch (1 ảnh), mọi bước hiện giá tường minh; tesseract eng+vie đã ship tái định vị thành lane "Đọc thô 0 phí" (G7 degradation) + nguồn bbox dự phòng. Spike vị trí (model bbox vs tesseract) khi implement. Chi tiết trong mục B1.
* ~~Q5: sau khi chốt nhập vào đâu?~~ **ĐÃ CHỐT (2026-10-31):** doc này là nhà duy nhất của các quyết định + đăng SITEMAP; KHÔNG rải vào gap table design-product-ui-2026 (sai độ cao — đó là nghiên cứu cấu trúc UI); khi v1.1 triển khai, mỗi feature P0 tốt nghiệp thành design doc riêng theo khuôn Goals/Non-Goals/CUJ/TP.

## 8. Nguồn

* Trang công khai của đối thủ tham chiếu — đọc toàn bộ 2026-10-31 (reader) + 6 ảnh minh họa tính năng & 1 slide deck mẫu phân tích vision.
* RE nội bộ của owner (private, 2026-10-27, mức UI + protocol SSE + bản đồ tính năng đầy đủ) — tham chiếu các mục §; không tái phân phối trong repo công khai theo precedent bảo mật đối thủ.
* `docs/reference/design-product-ui-2026.md` (gap table P0–P2, 7 luật DNA) và `docs/designs/design-direction.md` (nguyên tắc sản phẩm) — ràng buộc mọi đề xuất ở đây.
