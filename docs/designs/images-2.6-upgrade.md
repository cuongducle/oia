# IM26 — Images 2.6: đổi model + 4 khả năng mới (markup edit · GIF · SVG · complexity)

**Ngày:** 2026-11-07
**Trạng thái:** DRAFT chờ owner duyệt (Q1–Q6). Chưa đụng code, chưa tiêu quota.
**Tác giả:** cuongducle + agent
**Liên quan:** [designer-agent-loop.md](designer-agent-loop.md) (critic/auto refine chạy trên ảnh mới), [variant-preview-apply.md](variant-preview-apply.md) (preview-before-apply cho markup edit), [deconstruct-import.md](deconstruct-import.md) (B1 dùng cùng endpoints edit), [desktop-only-reorg.md](desktop-only-reorg.md) (D12 luật bump pin, D17 cảnh báo plan).

## Sự thật phát hành (nguồn, ngày 4/11/2026)

- **Bản chính thức:** openai.com/index/introducing-images-2-6 — "Images 2.6 … across ChatGPT, Codex, and the API", mọi subscription tier.
- **API model IDs** (API changelog 4/11): `gpt-image-2.6-sunburst` (chi tiết cao, consistency khi edit tốt nhất ở quality med/high) và `gpt-image-2.6-flare` (nhanh — quality low ra ảnh ~6 giây; layout poster/sản phẩm cải thiện). Nhanh hơn 50% so với 2.5.
- **Khả năng mới:** (a) **GIF động** — ChatGPT + API; (b) **SVG output** — API only; (c) **markup-guided editing** — gửi ảnh gốc + 1 layer PNG transparent chú thích (khoanh/mũi tên/chữ) ở field riêng, hỗ trợ cả model 2.5 lẫn 2.6; (d) **param `complexity`** low/med/high (default high) — dial "nháp nhanh vs đẵn chi tiết".
- **Ràng buộc markup (từ docs API):** layer chú thích phải cùng kích thước pixel đúng ảnh gốc; mỗi ảnh ≤ 16.777.216 px; file chú thích ≤ 50 MB; không kết hợp với mask hay prompt rewriter. Ảnh đầu tiên là ảnh được edit, ảnh thêm vào làm reference.
- **Giá:** nguồn báo giá thứ hai ghi "priced the same as Image-2.5" (~0,02 / 0,07 / 0,19 USD mỗi ảnh vuông low/med/high). **IM26-0 phải đối chiếu pricing page chính thức trước khi đổi default** — luật quota-is-money.
- **Provenance:** mọi output mang watermark SynthID + metadata C2PA (ChatGPT, Codex, API) — không tắt được. Ghi nhận trung thực cho seller: banner thương mại sinh từ model sẽ có dấu AI (tính năng với người mua cần minh bạch, rào cản với người muốn giấu).
- **Giới hạn GIF/SVG chưa có docs đầy đủ** (số frame, độ dài, kích thước SVG) — mọi claim UI phải chờ probe thật.

## Đối chiếu hiện trạng code

| Đường | Hiện tại | Ghi chú |
|---|---|---|
| BYO OpenAI key | `OPENAI_IMAGE_MODEL_DEFAULT = "gpt-image-2.5-sunburst"` (`packages/providers/src/wire/openai-images.ts:14`), env override qua registry (T3) | Đổi default = 1 dòng + gate; wire `/v1/images/generations` + `/edits` giữ nguyên |
| Codex (plan quota — đường chính) | `chatgpt-imagegen` theo plan usage (`packages/providers/src/image/codex.ts:241`); pin `rust-v0.166.0` (30/10, re-verify 6/11) | Model sau `chatgpt-imagegen` do server quay — 2.6 vào Codex từ 4/11 **có thể đã生效 không cần bump pin**, nhưng CHƯA có bằng chứng trên cặp pin này. Xác định bằng REAL_SMOKE (IM26-2) |
| Critic/auto refine (DA) | `readImage` vision chấm ảnh | Ảnh sinh từ 2.6 đi vào critic như thường — không đổi wire |
| Canvas | fabric scene JSON, layer text/ảnh shape | SVG → `fabric.loadSVGFromString` thành group layer; GIF → cần quyết định layer type (IM26-4) |

## Slices

### IM26-0 — Kiểm chứng dữ kiện + giá (0 quota, không code)
Đối chiếu pricing page chính thức + API reference (model IDs, param `complexity`, `output_format: svg`, field markup) + codex release notes sau 4/11. Output: bảng dữ kiện đã verify ghi lại doc này, sửa chỗ nào nguồn thứ hai sai.

### IM26-1 — Swap default BYO → `gpt-image-2.6-sunburst` (code nhỏ + 1 generation thật)
1 dòng đổi default (env override giữ nguyên cho ai muốn khóa 2.5). Gate: mock-pair test wire (không đổi — model chỉ là chuỗi), + **1 generation thật qua BYO key** để xác nhận model id hợp lệ + chất lượng không tụt (owner duyệt quota). Rủi ro thấp: giá như 2.5, endpoint không đổi.

### IM26-2 — Xác định model thật trên đường Codex (REAL_SMOKE, owner duyệt quota)
Chạy 1 generation thật trên cặp pin hiện tại (`rust-v0.166.0`); so sánh metadata/đặc điểm output với 2.5 (không có trường model trong output — dùng bằng chứng gián tiếp: tốc độ, hành vi GIF nếu hỏi, hoặc release notes codex). Kết quả:
- Nếu 2.6 đã chạy trên pin cũ → ghi ledger "cặp đã kiểm 2.6", KHÔNG bump.
- Nếu cần codex mới cho 2.6 → theo luật **D12**: bump pin ⇒ REAL_SMOKE phải pass qua binary mới trước khi ghi tested pair.

### IM26-3 — Markup edit "khoanh để sửa" (feature lớn — cần design riêng sau khi duyệt)
Đúng DNA "Layers, not magic": user khoanh vùng trên canvas (annotation layer tạm) + 1 câu ngắn → API edit với markup field. Đi qua khay preview của [variant-preview-apply.md](variant-preview-apply.md) (không auto-mutate canvas — G5/L5 giữ nguyên). Chỉ khả dụng khi provider hỗ trợ (BYO key; codex `$imagegen` chưa có markup field — capability gating như `--search` của DA). Chi tiết wire + UI + cost label ("≈ 1 image edit") — viết doc con khi owner duyệt hướng.

### IM26-4 — GIF output (probe thật trước, UI sau)
Prompt sinh GIF → hiển thị ở đâu (canvas preview + export file .gif), có vào livestream/social preset không. **Chưa hứa gì với user trước probe:** số frame, loop, dung lượng, codex path có GIF hay chỉ API.

### IM26-5 — SVG output → vector layer (API only)
`output_format: svg` → `fabric.loadSVGFromString` thành group layer chỉnh được. Hợp brand kit (logo đơn giản). Probe chất lượng SVG thật (path sạch hay raster giả dạng?) trước khi mở UI.

### IM26-6 — Complexity dial: Draft/Final trong composer
Map `complexity` low/high sang lựa chọn "Draft (nhanh, rẻ hơn)" / "Final" ở composer + cost label theo luật hiển thị. Hợp triết lý quota-is-money: iterate trên Flare/low, finish trên Sunburst/high. Chỉ mở khi IM26-1 xong + giá từng mức đã verify (IM26-0).

## Câu hỏi cho owner

- **Q1:** Duyệt IM26-1 (swap default BYO sang 2.6-sunburst + 1 generation thật verify)? Giá không đổi.
- **Q2:** BYO có expose lựa chọn model trong UI (sunburst/flare) không, hay giữ env-only như nay?
- **Q3:** Duyệt IM26-2 (1 REAL_SMOKE để biết đường plan đang chạy model nào)? Nếu cần bump pin thì theo luật D12 — duyệt cả quota smoke trên pin mới.
- **Q4:** IM26-3 markup edit — duyệt hướng để viết design doc con? (lane BYO trước, plan chờ codex hỗ trợ)
- **Q5:** Thứ tự GIF (IM26-4) vs SVG (IM26-5) — ưu tiên nào? Đề xuất: GIF trước (SEO/social là chân bán), SVG theo brand kit.
- **Q6:** Truyền thông: sau khi IM26-1/2 xong, landing + README cập nhật gì về model? (điểm marketing thật — "Images 2.6" — thay vì claim chung)

## TODO checklist

- [ ] IM26-0: verify giá + model IDs + param markup/SVG/GIF từ docs chính thức (0 quota)
- [ ] IM26-1: swap default + 1 generation thật (quota: 1 ảnh — chờ Q1)
- [ ] IM26-2: REAL_SMOKE xác định model đường codex (quota: 1 ảnh — chờ Q3)
- [ ] IM26-3: viết design doc markup edit (chờ Q4; sau đó mới code)
- [ ] IM26-4: probe GIF thật, ghi limits vào doc (quota: ~1–2 ảnh — gộp với IM26-2 nếu được)
- [ ] IM26-5: probe SVG thật (quota: ~1 ảnh)
- [ ] IM26-6: complexity dial (sau IM26-1 + IM26-0)
- [ ] Site/README: cập nhật claim model khi có bằng chứng thật (chờ Q6)

## Rủi ro & lưu ý trung thực

1. **Mọi slice đốt quota thật đều chờ duyệt từng lần** — không chạy tự động (luật repo + tiền lệ D12).
2. **SynthID/C2PA không tắt được** — seller muốn banner "sạch dấu AI" sẽ thất vọng; ghi thẳng trong FAQ sau khi ship, không giấu.
3. **SVG/GIF limits chưa được docs hóa đầy đủ** bởi OpenAI — mọi hứa hẹn UI chờ probe.
4. **Đường codex có thể đổi hành vi ngầm** (server quay model sau `chatgpt-imagegen`) — critic + smoke thật là lưới an toàn; không claim version model trên đường plan nếu không đo được.
5. Mock pair phải cover wire mới (markup field, output_format, complexity) **trước** khi đường thật chạy — lỗi-path gate theo luật repo, không happy-path only.
