---
type: "Design"
title: "Template system (TPL)"
description: "Template growth loop researched from Canva and PosterMyWall: taxonomy, programmatic and AI plates, publish-with-notes, and the indexable templates hub; T1-T5 shipped."
tags: [design, templates, site, shipped]
status: stable
generated: { by: human:cuongducle, at: 2026-11-03T00:00:00Z }
---

# TPL: Template system: nghiên cứu đối thủ → làm giàu kho template của Oia

**Ngày:** 2026-11-03
**Trạng thái:** T1 ✅ · **T3 batch 1+2 ✅** (7 studio templates, 8/8 taxonomy categories có phủ, quota cộng dồn: **5 ảnh + 5 reads**) · T4 soft ✅ · **T5 ✅ (2026-11-04)**: hub /templates/ theo category + 6 trang category SEO (generator tái tạo được `site/templates/build.py`, sitemap +6 URL, download data-dl). T1 ✅ (kèm goldfish pass 1). **T3 batch 1 ✅ (2026-11-03, owner "bắt tay vào làm" = duyệt Q1-Q3):** 3 template thật (flash-sale / menu / social-post), quota tiêu hao thật: **3 ảnh + 3 reads** (critic pass vòng 1 cả 3, không refine). Overlay KHÔNG sinh mới, nhóm "Livestream" của Editor (LIVESTREAM_TEMPLATES) đã phủ. **T4 soft ✅** (warnings trong publish result, Editor hiển thị "Published with notes"). T5 = sau (Q3). Batch 2 (new-product, deck, poster, holiday) chờ hiệu quả batch 1.
**Nguồn nghiên cứu:** Canva growth case study (growthcasestudies.com, 11/2025), PosterMyWall template-authoring guide, Canva conversational onboarding (getperspective.ai 5/2026), SurgePix RE nội bộ (docs/private/surgepix-reverse-engineering.md). Lớp STYLE (Editorial × Swiss + cặp font + size quốc tế) tách ra doc riêng: [social-card-style-presets.md](social-card-style-presets.md).

## Nghiên cứu: 4 bài học lớn

### 1. Canva: template là GROWTH LOOP, không phải tính năng phụ
Mỗi category template = 1 landing page được index (SEO acquisition); filter con (format/style/theme/color) nhân số page ra nhiều lần; nhân bản 28 ngôn ngữ. Template cũng giải cold-start ("không bao giờ blank canvas"), giữ retention (kho mới theo trend, mỗi use case một lý do quay lại), và là revenue tier (premium lock). **Bài học cho Oia:** kho template là ống hút người dùng dài hạn, đáng đầu tư như feature chính, nhưng Oia là desktop OSS local-first nên loop SEO thay bằng: site templates page theo category (static, indexable) + seed chất lượng trong app.

### 2. PosterMyWall: giáo trình làm template CHO NGƯỜI KHÁC SỬA
- **"Facilitate customization"**: ít element, thoáng, không chồng lớp khiến chọn khó
- **"Sensible placeholders", CẤM lorem ipsum/"Add text"**: template menu thì có món + giá thật; chỗ company name/tagline/contact phải thấy ngay vị trí. Placeholder "lười" = template rác
- Category convention (real estate = ảnh phòng lớn; concert = bold tối màu); tối đa 2-3 font
- **Quality gate để PUBLISH**: ảnh mờ/nhẹ bị từ chối
**Bài học cho Oia:** đây chính là lý thuyết clean-plate + blocks có ROLE (headline/price/date/name) của Oia, doctrine đã đúng hướng, cần ép chặt hơn ở seed + publish gate.

### 3. Canva onboarding hội thoại: "editor là chỗ TINH CHỈNH, không phải chỗ BẮT ĐẦU"
Magic Design sinh draft trong vài giây; user không bao giờ đối diện canvas trắng. Oia đã đúng hướng (Home prompt-first + chips danh mục + outline gate), nhưng chips hiện chỉ seed PROMPT, chưa dẫn tới STARTING TEMPLATE.

### 4. SurgePix (RE nội bộ): gallery cộng đồng + credit tip
Gallery Featured (thumbnail 1/N, tác giả, tip credits), publish → community, tác giả nhận credit. Oia đã có đủ store (publish/list/tip BR-TPL1-3), thiếu TAXONOMY + surface.

## Hiện trạng Oia (gap)

| Hạng | Hiện có | Gap |
|---|---|---|
| Store | `TemplateStore` local: publish/list(featured)/tip/get; field `category` tồn tại (LV-7) nhưng **không ai dùng**: không constant taxonomy, `list()` không lọc, query không nhận | T1 |
| Seed | 4 studio templates (matcha/festival/botanical/perspective), artwork sạch + text overlay đúng doctrine | Quá mỏng so với "there's a template for that" |
| Publish | Chỉ validate schema shape | Không quality gate (ảnh mờ, thiếu text block có role, thiếu category) |
| Surface | Site `/templates/` 1 trang phẳng; app gallery theo RE-map? | Không category chips, không per-category page (SEO loop), thumbnail 1/N chưa có |

## Slices

### T1: Taxonomy + filter (LÀM luôn trong PR này)
`@oia/schema`: `TEMPLATE_CATEGORIES` (id + label EN, **align theo VOCABULARY chips Home**: chưa phải contract id: chips là label UI, wiring thật thuộc T5; `poster`/`overlay` là category store-only chưa có chip) + `templateCategorySchema`. Định nghĩa tách bạch (G3): `overlay` = overlay trong suốt generic (lower-third, frame); `livestream` = preset 1080×1920 platform-safe (dòng LV-7). `TemplateStore.list(q)` nhận `category`; `templateListQuery` nhận `category`. Additive D14, test ghim parse + filter + legacy không vỡ.

### T2: Template authoring doctrine (doc, chờ duyệt)
Ghi chuẩn vào doc này (mục "Doctrine" dưới): mọi template seed/publish của Oia phải đạt: (a) artwork clean-plate (không chữ nướng, trừ loại "poster-art" ghi rõ), (b) ≥1 text block có role đúng + copy MẪU THẬT (không "Add text"), (c) ≤3 font, (d) nội dung chính trong safe-area copy-zones, (e) có category. Áp cho cả publish gate (T4).

### T3: Starter pack 8 template English (chờ duyệt: quota thật)
Mỗi category 1 template: flash-sale (price-banner), new-product, livestream overlay, menu, social post, deck cover, poster, holiday sale. Nguồn: real run clean-plate (~1 ảnh/template + 1 read nếu refine) ≈ **8-10 ảnh quota + buffer retry ~30%** (tỷ lệ run hỏng thực tế tuần này ~40%, 3/7) theo quy chế đứng; số tiêu hao thật ghi lại đây sau mỗi đợt. Pipeline: harvest như quy trình asset tuần này → author scene JSON (artwork + blocks có role) → seed theo pattern sample hiện có.

### T4: Publish quality gate (chờ duyệt)
`TemplateStore.publish` từ chối khi: thumbnail < ngưỡng byte/kích thước, scene thiếu text block, category trống. Không chặn publish community lạnh giá, cảnh báo mềm bản đầu, hard sau.

### T5: Surfaces (chờ duyệt)
- App gallery: chips category (lọc client-side theo list(category))
- Site `/templates/` → bento theo category + trang category riêng (static gen, SEO loop bản OSS)
- Thumbnail 1/N + author + tip (đã có data)

## Doctrine (T2 nội dung chuẩn)

1. Template là **bối cảnh cho người khác thay chữ**: copy mẫu thật đúng ngành (menu = món + giá; flash-sale = offer + deadline)
2. Mỗi text block mang role từ danh sách chuẩn (headline, price, discount, date, name, slogan, subtitle), đúng blocks[] của planner
3. ≤3 font; artwork clean trừ khi ghi rõ "poster-art"
4. Chữ nằm trong copy-zones (không sát mép, safe area 10% đã là luật DEF-1)
5. Category bắt buộc từ TEMPLATE_CATEGORIES

## Quyết định owner (chờ)

| # | Hỏi | Đề xuất |
|---|---|---|
| Q1 | Duyệt T3 starter pack (8-10 ảnh quota thật)? | **ĐÃ DUYỆT + làm batch 1 (2026-11-03)**: 3 run thật = 3 ảnh + 3 reads; overlay dùng LIVESTREAM_TEMPLATES sẵn có (0 quota). Batch 2 chờ đánh giá. |
| Q2 | T4 publish gate hard ngay hay soft-warning trước? | **SOFT ĐÃ LÀM (2026-11-03)**: publish trả warnings[] (category thiếu / không có text layer / artwork inline), Editor hiện "Published with notes". Hard sau 1 release. |
| Q3 | T5 site per-category pages (SEO loop) ưu tiên bao sớm? | **ĐÃ LÀM (2026-11-04)**: sau khi 8/8 category có phủ. Hub + 6 trang category (flash-sale, menu, social-post, new-product, poster, deck); FAQ riêng mỗi trang (không spam trùng); generator committed. |

## Hậu kiểm kho đóng kèm (2026-11-12)

Xem [template-bundle-audit.md](template-bundle-audit.md): 35 mẫu, đủ 8 nhóm
trong cả Home và Editor. Đính chính phạm vi câu “8/8 có phủ” phía trên:
livestream trước đây chỉ hiện trong Editor, còn Overlay generic chưa có mẫu
riêng trong kho Home. Nay dùng catalog chung, thêm 2 Overlay trong suốt;
không gộp generic Overlay với preset vùng an toàn Livestream. Không thay đổi
hợp đồng store/publish, không ghi đè project cũ.

## Wire notes (G7, goldfish)

- `templates.create` giờ **400** với category id ngoài taxonomy (edge enforcement), thay đổi hành vi wire có chủ đích, ghi ở đây theo phép lịch sự D14
- `templates.list` nhận `input` tùy chọn (page/pageSize/featured/category qua `templateListQuery`), trước đây hardcode trang 1 và **đổ query của caller** (G1: bug thật: featured filter từ renderer chưa từng chạy)

## TP / luật bị chạm

- D14 additive: category filter + taxonomy constant, không bump schema version
- Quy chế quota đứng (2026-11-03): T3 dùng real pair, báo số ảnh tiêu hao vào đây khi chạy
