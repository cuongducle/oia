---
type: "Design"
title: "Social card style presets (SC)"
description: "STYLE layer over the template taxonomy: Editorial E-ink and Swiss International systems, ten verified Vietnamese font pairs, three international sizes; SC-1..5 shipped with 24 templates and zero-read growth."
tags: [design, templates, style, shipped]
status: stable
generated: { by: human:cuongducle, at: 2026-11-06T00:00:00Z }
---

# SC: Social-card style presets: lớp style Editorial × Swiss cho template Oia

**Ngày:** 2026-11-06
**Trạng thái:** DRAFT chờ owner duyệt (Q1-Q3). Chưa đụng code, chưa tiêu quota.
**Tác giả:** cuongducle + agent
**Liên quan:** [template-system.md](template-system.md) (taxonomy TPL + doctrine T2: doc này là lớp STYLE phủ lên, không thay taxonomy), [designer-agent-loop.md](designer-agent-loop.md) (critic vision mở rộng style checks ở SC-2).

## Nguồn & trạng thái vật liệu

Bản làm việc nằm NGOÀI repo: `/Users/cuong/orca/projects/Misc/guizang-intl/social-card-intl/` (1 MB), bản quốc tế hóa từ [op7418/guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill) (**AGPL-3.0**). Đã smoke-verify (2026-11-06): 2 template hạt (HTML/CSS) render chuẩn bằng Chrome headless ở 4 card demo (2 hệ style × 3 cặp font), QA thị giác 3 vòng (bắt được: accent bị cắt do overflow, bài học ghi vào SKILL.md nguồn), kiểm chứng subset **Vietnamese của 28 font Google Fonts** (loại 7 font không có dấu VN: Bodoni Moda, Figtree, Outfit, Rubik, Urbanist, Sora, Fira Code).

## Cái gì được mang vào Oia (và cái gì không)

| Thành phần nguồn | Mang vào Oia? | Hình thức |
|---|---|---|
| 2 hệ style: **Editorial Magazine** (serif display + atmosphere giấy/mực, 6 palette) và **Swiss International** (sans + 1 accent + lưới, 4 palette) | ✅ SC-2 | `TEMPLATE_STYLES`, style tokens (palette + luật) áp cho mọi category TPL |
| 10 cặp font đã verify VN (mỗi cặp = display + body + mono) | ✅ SC-2 | Whitelist font pairing, mỗi cặp đúng luật "≤3 font" của doctrine T2 |
| Board sizes: IG 4:5 (1080×1350), Pinterest 2:3 (1000×1500), X 16:9 (1600×900) | ✅ SC-1 | Bổ sung `SIZE_PRESETS`, đang thiếu cả 3 (có sẵn IG 1:1, FB 1.91:1 = OG 1200×630, TikTok 9:16, RedNews 1242×1660 ≈ 3:4) |
| Hook patterns tiếng Anh cho cover (listicle/contrarian/first-person/before-after) | ✅ SC-3 | Copy mẫu thật cho text block role "headline" (đúng doctrine T2 mục 1-2) |
| HTML/CSS template, WebGL background, validator .mjs | ❌ không merge | Oia render bằng fabric scene JSON; HTML lane ngoài scope (ghi rõ để không "phát hiện lại") |
| Thang giá trị "editorial/swiss checklist" | ✅ SC-2 | Mở rộng critic checklist của auto-refine (mode poster) |

## Slices

### SC-1: Size presets quốc tế (0 quota, additive)
`@oia/canvas` `SIZE_PRESETS` thêm 3 mục: `"Instagram Portrait (4:5)": 1080×1350`, `"Pinterest (2:3)": 1000×1500`, `"X / Twitter (16:9)": 1600×900`. Đúng pattern BR-ED3 hiện có (tên nền tảng, không phải tỉ lệ trần). Gate: test ghim danh sách preset + shot Settings panel không đổi gì khác.

### SC-2: TEMPLATE_STYLES + critic checklist (wire additive D14)
`@oia/schema`: `TEMPLATE_STYLES` = `{ id, label EN, palette (paper/ink/accent/line), fontPair (từ whitelist 10 cặp), laws[] }`, bản đầu 2 style (`editorial`, `swiss`) × 2 palette đại diện. Planner/Home chip thêm "Style" (chỉ label UI, wiring như TPL T1 đã làm). Critic (DA auto-refine, mode poster) thêm nhóm check theo style: editorial = serif display + atmosphere không nền phẳng; swiss = đúng 1 accent + không gradient/shadow/rounded + display weight nhẹ. Gate: schema test ghim parse + legacy không vỡ; critic test lỗi-path (template vi phạm luật swiss → verdict fail có lý do).

### SC-3: Batch template "social-post" theo 2 style (quota thật, chờ duyệt)
4 template: {editorial × playfair, editorial × lora, swiss × inter, swiss × oswald} × category `social-post`, khung SC-1 (2 dùng IG 4:5, 2 dùng IG 1:1). Copy mẫu theo hook patterns (menu thật / offer thật, không lorem ipsum, doctrine T2). Pipeline như TPL T3: real run clean-plate + author scene JSON. Dự toán theo quy chế đứng: **4 ảnh + 4 reads + buffer retry ~30%**; số tiêu hao thật ghi lại đây sau đợt.

ĐÃ THỰC THI đợt 1 (2026-11-06), 6 template, 0 quota:** biến thể programmatic clean-plate (`scripts/gen-style-plates.py`, seed cố định, tái tạo byte-đúng): swiss-flashsale (flash-sale, IG 4:5, accent IKB), swiss-spec (new-product, 1:1), swiss-statement (social-post, 16:9, accent cam), ed-menu (menu, 4:5, kraft, copy tiếng Việt có dấu, BVP render chuẩn), ed-feature (social-post, 1:1, dune), ed-holiday (poster, 4:5, midnight tối). Font: thêm BVP 200/300 (4 woff2 subset ~37KB, @font-face additive) cho luật Swiss "chữ to nét mảnh". Đợt AI clean-plate thật (đốt quota) làm tiếp theo nhu cầu, template programmatic đã phủ 2 style × 3 khung tỉ lệ.

**ĐÃ THỰC THI đợt 2, AI clean-plate thật (2026-11-07, owner "đốt quota luôn"):** 5 ảnh + **0 reads** (research off, selfImprove rounds 0, qua temp harvest patch theo tiền lệ T3, đã revert). Kết quả: 4 template mới ship, ed-menu3 (menu; plate đầu bị loại vì composition đạo cụ lấn vùng chữ, rerun với prompt tường minh "đồ ăn dồn đáy, sạch 2/3 trên"), ed-product2 (new-product), ed-holiday2 (poster dark), ed-poster2 (poster). Mọi vị trí chữ đặt theo bản đồ vùng sạch do vision QA đo bounding box đạo cụ, không đặt mò. QA vòng 2 bắt nhóm lỗi clipping, phần lớn là artifact script PIL không wrap chữ như fabric thật (đã thêm word-wrap vào script); lỗi thật (deck 2 dòng đẩy va rule, footer đè đá travertine, kicker đè tách) đã sửa. **Ledger tiêu hao lũy kế SC-3: 5 ảnh thật + 0 reads.** Gates: build/test/typecheck xanh; vision PASS 4/4.

**ĐÃ THỰC THI đợt 3, style-preset plates (2026-11-07, owner "quota thoải mái"):** 5 ảnh + **0 reads**, lần đầu `style` chạy xuyên đường ống thật (SC-2): editorial → ed-street (phở street poster, copy VN), ed-fashion (linen boutique), ed-deck (lookbook cover); swiss → swiss-sneaker (Klein blue, 1 accent vàng), swiss-bottle (lemon, 1 accent xanh), 2 plate swiss PASS kiểm "phẳng tuyệt đối" của chính luật SC-2. Tổng kho: **24 template**. Sự cố vận hành ghi trung thực: 4 lần chạy harvest "treo", nguyên nhân là out/ cũ (đã vá patch nhưng quên rebuild; AGENTS.md cảnh báo đúng cái bẫy này), không phải lỗi sản phẩm; mock probe đã cô lập, rebuild xong 5/5 OK. seedSamples.test vỡ do giả định recent() (cap 20) chứa toàn bộ kho, kho 24 vượt cap; sửa test truyền length tường minh (hành vi sản phẩm không đổi). **Ledger lũy kế SC-3: 10 ảnh + 0 reads.** Gates: build 8/8, test 16/16, typecheck 15/15, shot exit 0; vision PASS 5/5.

**ĐÃ THỰC THI SC-5 pack hoàn chỉnh đầu tiên, TẾT SALE PACK (2026-11-08, owner "thử làm 1 pack hoàn chỉnh"):** 6 template (4 AI editorial theo prompt composition chuẩn + 2 procedural swiss phẳng đỏ/vàng), copy tiếng Việt đầy đủ dấu (QA xác nhận từng dấu chồng: ị+circumflex, ượng, MIỄN, ĐẶT TRƯỚC). Vision QA vòng 2 bắt 3 lỗi thật: luật 1-accent vi phạm ở cả 2 card swiss (eyebrow màu accent → đổi ivory/olive), **toán học giá sai** (599/899 = 33% đổi claim "Giảm 40%", sửa old price thành 999.000₫ cho khớp 40%), hạn voucher vô lý (tháng 9 → 15 tháng hai). Provenance +4 prompt; pack filter `tet-sale`; site `/templates/packs/tet-sale/` (bilingual lede, FAQ tiếng Việt, mục provenance prompt); sitemap +1; hub link. **Quota đợt: 4 ảnh + 0 reads, lũy kế SC: 14 ảnh + 0 reads, kho 30 template.** Gates: build 8/8, test 16/16, typecheck 15/15, shot exit 0; vision PASS 6/6 sau vá.

**QA log (visual-template-qa.py + vision):** 5 vòng, bắt được: script ép canvas 1024×1536 làm méo mọi card không 2:3 (artifact); weight 200 không render vì trục variable font là [Weight, Width] (đã vá, đo pixel xác nhận nét 6px vs 11px @100px); 2 lỗi vị trí thật (chữ đè lưới ×, chấm đè hairline); 1 lỗi patch nhầm file (sửa plate mà ghi vào studio-templates.ts, python replace no-op âm thầm, plate giữ vị trí cũ), tất cả đã vá, PASS 3/3 items vòng cuối. Gates: build 8/8, test 16/16, typecheck 15/15, shot exit 0 (probe oia:// files FAIL là pre-existing test-dir noise, đã đối chiếu mã nguồn probe).

### SC-4: Site facet theo style (SAI KỲ LỆCH: ĐÃ LÀM 2026-11-07)
Thay vì `?style=` query (không index tốt bằng trang riêng), làm 2 trang style tĩnh theo pattern T5: `/templates/styles/editorial/` + `/templates/styles/swiss/` (8 + 5 card, FAQ riêng từng style nhắc đúng luật critic v3.3). Hub `/templates/` thêm 4 link (2 style + 2 pack); sitemap +4 URL.

### SC-5: Preset packs cho gen ảnh (chờ duyệt, mới 2026-11-06)

**Định nghĩa gen-preset Oia:** một bundle = scene template (TPL) + style token (SC-2) + **prompt gốc sinh artwork** (lưu vào `provenance`, `packages/canvas/src/provenance.ts` đã có chỗ) + size preset. Người dùng chọn preset → nạp ảnh sản phẩm/khách hàng của họ → output giữ look. Khác biệt sống còn so với chợ prompt (PromptBase): prompt trần trụi copy được trong 1 cú paste; preset gắn scene + role + provenance là cái máy tái lập look khi subject đổi.

**Vì sao mô hình này có chỗ đứng (đối chiếu preset Lightroom/VSCO):** preset ảnh bán sự nhất quán + nén kỹ năng, không bán cái đẹp. Gen-preset giá trị cao hơn vì input mỗi người khác nhau (sản phẩm riêng) mà look phải giống nhau, chính là bài clean-plate + blocks + style tokens giải. Cơ chế marketplace đã tồn tại sẵn: `TemplateStore` publish/list/featured/tip (BR-TPL1-3), chỉ thiếu đóng gói pack + phân phối.

**Phân phối (đúng bài mượn kênh):** trang SEO per-pack (pattern T5 đã ship cho category), creator publish preset nhận tip (mô hình SurgePix, đã research trong TPL), pack theo ngách ICP làm landing riêng ("Tết sale pack", "menu quán pack", "US dropship pack"), KHÔNG làm kho generic "300 presets" (bài học bão hòa Lightroom market; cái thắng là niche + brand như Tezza).

**Slices khi duyệt:** (1) schema `packId` optional trên Template + list theo pack (additive D14); (2) seed 2 pack theo 2 style của SC-3 (gộp quota với SC-3: không tốn thêm); (3) site `/templates/packs/<slug>` (generator mở rộng của T5); (4) provenance ghi prompt gốc vào seed. **Moat note:** preset đơn lẻ copy được; kho + taxonomy + số liệu dùng nhiều + creator network mới là tài sản cộng dồn, quyết định đầu tư theo đó.

**ĐÃ THỰC THI SC-5 (2026-11-07, cùng SC-4):**
- (1) `TEMPLATE_PACKS` (cafe-restaurant, product-launch) + `Template.pack` + list filter compose với style/category, edge parse (junk 400), import sanitize; test suite mirror SC-2
- (2) 11 template gắn pack (5 quán ăn + 6 launch), **0 quota** (tái dùng template SC-3)
- (4) `template-provenance.ts`: prompt gốc của 9 plate AI (mode/style/ngày), test ghim mọi entry ánh xạ đúng template + mọi plate AI có provenance + prompt thật (chứa "no text", >80 ký tự, không placeholder)
- (3) Site: `/templates/packs/{cafe-restaurant,product-launch}/`, mỗi pack có mục "Grown from real prompts" (provenance prompt hiển thị dạng collapsible), điểm khác biệt SEO: template kèm công thức tái tạo look trên sản phẩm của người dùng; FAQ hướng dẫn rerun prompt với subject riêng
- Gates: build 8/8, test 16/16, typecheck 15/15, shot exit 0

## Quyết định owner (chờ)

| # | Hỏi | Đề xuất |
|---|---|---|
| Q1 | **License AGPL của nguồn xử lý thế nào?** (a) dùng như *design-language reference*: luật style, thông số khung, hook pattern, whitelist font là ý tưởng/thông số, author lại scene JSON thuần Oia, **không copy file nào** từ nguồn → không dính AGPL; (b) copy HTML/CSS/assets vào repo/app → phần đó phải giữ AGPL-3.0 khi phân phối app | **ĐÃ DUYỆT (a), owner 2026-11-06.** Bản làm việc giữ ở Misc/guizang-intl làm tham chiếu + render thử; không merge file nguồn vào repo |
| Q2 | Duyệt SC-3 batch 4 template (4 ảnh + 4 reads + buffer)? | **ĐÃ DUYỆT (owner 2026-11-06: "làm càng nhiều càng tốt")**: mở toàn bộ batch + các batch sau, điều kiện theo quy chế đứng: mỗi template ~1 ảnh + 1 read nếu refine, ghi số tiêu hao thật vào ledger dưới đây sau mỗi đợt; dừng khi chất lượng clean-plate tụt (tỷ lệ run hỏng >50% như tuần trước) hoặc owner gọi dừng |
| Q3 | SC-1 + SC-2 làm ngay (0 quota, additive)? | Có thì gộp 1 PR |
| Q4 | Duyệt hướng **SC-5 preset packs** (bundle template + style + prompt provenance, phân phối site SEO + creator tip)? Nếu có: seed 2 pack đầu tiên gộp chung quota với SC-3 | **ĐÃ DUYỆT HƯỚNG (owner 2026-11-06, sau phần giảng cơ chế trang SEO per-pack)**: pack theo ngách ICP, không generic; seed 2 pack gộp quota SC-3, làm sau khi SC-3 nghiệm thu 2 template đầu. Q1-Q3 vẫn chờ |

## Whitelist font pairing (đã verify subset Vietnamese 2026-11-06)

| Style | Cặp | Cấu thành |
|---|---|---|
| editorial | `playfair` | Playfair Display + Inter + IBM Plex Mono |
| editorial | `fraunces` | Fraunces + Work Sans + Space Mono |
| editorial | `lora` | Lora + Plus Jakarta Sans + JetBrains Mono |
| editorial | `newsreader` | Newsreader + Archivo + Roboto Mono |
| editorial | `prata` | Prata + Manrope + Space Mono |
| swiss | `inter` | Inter + JetBrains Mono |
| swiss | `space-grotesk` | Space Grotesk + Inter + Space Mono |
| swiss | `archivo` | Archivo + Work Sans + Roboto Mono |
| swiss | `manrope` | Manrope + IBM Plex Mono |
| swiss | `oswald` | Oswald + Barlow + Roboto Mono |

Ghi chú renderer: app đã mặc định `Be Vietnam Pro` cho Textbox (studio-templates.ts), các cặp trên cần load thêm webfont trong renderer public assets hoặc fallback hệ thống; quyết định cơ chế load font (bundle vs CDN vs system) thuộc SC-2 khi làm.

## Bẫy đã bắt được từ nguồn (ghi lại để không đi lại)

`gz-t-*` role class của nguồn mang kích thước mặc định LỚN (display 168-200px, subhead 56px, num 96px), layout tay không override sẽ tràn khung và `overflow:hidden` cắt cụt hàng cuối (biểu hiện: "màu accent biến mất"). Bài cho Oia: critic check **nội dung chính không sát mép** đã có; thêm check "hàng cuối/canonical element phải trong safe-area" cho template swiss có stats row.

## TP / luật bị chạm

- SC-2 wire additive D14 (template category + style đều optional field)
- Quota SC-3 theo quy chế đứng (báo số thật vào đây khi chạy)
- Không đụng `desktop-only-reorg.md` checklist (doc-only, chưa code)
