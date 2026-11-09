# IM26: Images 2.6: đổi model + 4 khả năng mới (markup edit · GIF · SVG · complexity)

**Ngày:** 2026-11-07
**Trạng thái:** ĐANG THỰC THI, owner "Duyệt hết" (Q1-Q6) 2026-11-07. IM26-0/1/2/3 ✅ + Q6 chốt; còn mở: IM26-5 (SVG) và IM26-6 (complexity), đều chờ lane BYO tồn tại.
**Tác giả:** cuongducle + agent
**Liên quan:** [designer-agent-loop.md](designer-agent-loop.md) (critic/auto refine chạy trên ảnh mới), [variant-preview-apply.md](variant-preview-apply.md) (preview-before-apply cho markup edit), [deconstruct-import.md](deconstruct-import.md) (B1 dùng cùng endpoints edit), [markup-edit.md](markup-edit.md) (IM26-3 design doc con), [desktop-only-reorg.md](desktop-only-reorg.md) (D12 luật bump pin, D17 cảnh báo plan, D18 lane BYOK đã rút).

## Sự thật phát hành (nguồn, ngày 4/11/2026)

- **Bản chính thức:** openai.com/index/introducing-images-2-6, "Images 2.6 … across ChatGPT, Codex, and the API", mọi subscription tier.
- **API model IDs** (API changelog 4/11): `gpt-image-2.6-sunburst` (chi tiết cao, consistency khi edit tốt nhất ở quality med/high) và `gpt-image-2.6-flare` (nhanh, quality low ra ảnh ~6 giây; layout poster/sản phẩm cải thiện). Nhanh hơn 50% so với 2.5.
- **Khả năng mới:** (a) **GIF động**: ChatGPT + API; (b) **SVG output**: API only; (c) **markup-guided editing**: gửi ảnh gốc + 1 layer PNG transparent chú thích (khoanh/mũi tên/chữ) ở field riêng, hỗ trợ cả model 2.5 lẫn 2.6; (d) **param `complexity`** low/med/high (default high), dial "nháp nhanh vs đẵn chi tiết".
- **Ràng buộc markup (từ docs API):** layer chú thích phải cùng kích thước pixel đúng ảnh gốc; mỗi ảnh ≤ 16.777.216 px; file chú thích ≤ 50 MB; không kết hợp với mask hay prompt rewriter. Ảnh đầu tiên là ảnh được edit, ảnh thêm vào làm reference.
- **Giá (IM26-0 đã đối chiếu):** pricing page chính thức (SSR 7/11) liệt kê 2.6 theo mô hình token, **Image tokens $8/1M + Text tokens $5/1M** (cached snippet cùng trang; bảng per-image trên bản SSR đang thiếu hàng 2.6/2.5, chỉ còn 1.5/1/latest). Nguồn thứ cấp nhất quán: "priced the same as 2.5". Kết luận dùng được: **chi phí ngang 2.5**: ảnh vuông thực đo của thế hệ trước ~0,006-0,06 USD tùy quality. Con số "0,02/0,07/0,19" ghi ở bản nháp đầu là của bên thứ ba (Higgsfield), coi là ước tính, không phải bảng giá chính thức.
- **Provenance:** mọi output mang watermark SynthID + metadata C2PA (ChatGPT, Codex, API), không tắt được. Ghi nhận trung thực cho seller: banner thương mại sinh từ model sẽ có dấu AI (tính năng với người mua cần minh bạch, rào cản với người muốn giấu).
- **Giới hạn GIF/SVG chưa có docs đầy đủ** (số frame, độ dài, kích thước SVG), mọi claim UI phải chờ probe thật.

## Đối chiếu hiện trạng code

| Đường | Hiện tại | Ghi chú |
|---|---|---|
| BYO OpenAI key | `OPENAI_IMAGE_MODEL_DEFAULT`, **ĐÃ ĐỔI sang `gpt-image-2.6-sunburst`` (IM26-1)** (`packages/providers/src/wire/openai-images.ts`), env override qua registry (T3), pin test mới trong `registry-env.test.ts` | **Phát hiện IM26-0: lane BYO KHÔNG tồn tại trong UI desktop**: `buildServiceEnv` chỉ tạo mode mock/codex; không có chỗ nào nhập OpenAI/fal key (D18 đã rút). Wire openai vẫn chạy cho runner tự cấu hình env (test/CI/agent-api) |
| Codex (plan quota, đường chính) | `chatgpt-imagegen` theo plan usage (`packages/providers/src/image/codex.ts:241`); pin `rust-v0.166.0` (30/10, re-verify 6/11) | Model sau `chatgpt-imagegen` do server quay, 2.6 vào Codex từ 4/11 **có thể đã生效 không cần bump pin**, nhưng CHƯA có bằng chứng trên cặp pin này. Xác định bằng REAL_SMOKE (IM26-2) |
| Critic/auto refine (DA) | `readImage` vision chấm ảnh | Ảnh sinh từ 2.6 đi vào critic như thường, không đổi wire |
| Canvas | fabric scene JSON, layer text/ảnh shape | SVG → `fabric.loadSVGFromString` thành group layer; GIF → cần quyết định layer type (IM26-4) |

## Slices

### IM26-0: Kiểm chứng dữ kiện + giá (0 quota, không code)
Đối chiếu pricing page chính thức + API reference (model IDs, param `complexity`, `output_format: svg`, field markup) + codex release notes sau 4/11. Output: bảng dữ kiện đã verify ghi lại doc này, sửa chỗ nào nguồn thứ hai sai.

### IM26-1: Swap default BYO → `gpt-image-2.6-sunburst` (code nhỏ + 1 generation thật)
1 dòng đổi default (env override giữ nguyên cho ai muốn khóa 2.5). Gate: mock-pair test wire (không đổi, model chỉ là chuỗi), + **1 generation thật qua BYO key** để xác nhận model id hợp lệ + chất lượng không tụt (owner duyệt quota). Rủi ro thấp: giá như 2.5, endpoint không đổi.

### IM26-2: Xác định model thật trên đường Codex (REAL_SMOKE, owner duyệt quota)
Chạy 1 generation thật trên cặp pin hiện tại (`rust-v0.166.0`); so sánh metadata/đặc điểm output với 2.5 (không có trường model trong output, dùng bằng chứng gián tiếp: tốc độ, hành vi GIF nếu hỏi, hoặc release notes codex). Kết quả:
- Nếu 2.6 đã chạy trên pin cũ → ghi ledger "cặp đã kiểm 2.6", KHÔNG bump.
- Nếu cần codex mới cho 2.6 → theo luật **D12**: bump pin ⇒ REAL_SMOKE phải pass qua binary mới trước khi ghi tested pair.

### IM26-3: Markup edit "khoanh để sửa" (feature lớn: cần design riêng sau khi duyệt)
Đúng DNA "Layers, not magic": user khoanh vùng trên canvas (annotation layer tạm) + 1 câu ngắn → API edit với markup field. Đi qua khay preview của [variant-preview-apply.md](variant-preview-apply.md) (không auto-mutate canvas, G5/L5 giữ nguyên). Chỉ khả dụng khi provider hỗ trợ (BYO key; codex `$imagegen` chưa có markup field, capability gating như `--search` của DA). Chi tiết wire + UI + cost label ("≈ 1 image edit"), viết doc con khi owner duyệt hướng.

### IM26-4: GIF output (probe thật trước, UI sau)
Prompt sinh GIF → hiển thị ở đâu (canvas preview + export file .gif), có vào livestream/social preset không. **Chưa hứa gì với user trước probe:** số frame, loop, dung lượng, codex path có GIF hay chỉ API.

### IM26-5: SVG output → vector layer (API only)
`output_format: svg` → `fabric.loadSVGFromString` thành group layer chỉnh được. Hợp brand kit (logo đơn giản). Probe chất lượng SVG thật (path sạch hay raster giả dạng?) trước khi mở UI.

### IM26-6: Complexity dial: Draft/Final trong composer
Map `complexity` low/high sang lựa chọn "Draft (nhanh, rẻ hơn)" / "Final" ở composer + cost label theo luật hiển thị. Hợp triết lý quota-is-money: iterate trên Flare/low, finish trên Sunburst/high. Chỉ mở khi IM26-1 xong + giá từng mức đã verify (IM26-0).

## Câu hỏi cho owner: ĐÃ DUYỆT HẾT (2026-11-07 "Duyệt hết"), ghi nhận cách giải

- **Q1 ✅ LÀM:** default BYO đổi sang `gpt-image-2.6-sunburst` + pin test. Verify model-id bằng 1 generation thật qua API **hoãn lại**: app không có BYO key nào (lane không tồn tại), không đọc key từ shell theo luật không-rút-credential. Model-id lấy thẳng từ API changelog chính thức, rủi ro thấp.
- **Q2 ✅ GIẢI THEO THỰC TẾ:** không có UI BYO để gắn model picker (D18 rút rồi). `OPENAI_IMAGE_MODEL` env override giữ nguyên cho runner tự cấu hình. Mở lại picker khi lane BYO tồn tại trở lại.
- **Q3 ✅ CHẠY:** REAL_SMOKE trên pin `rust-v0.166.0` (auth sẵn trên máy, binary đóng kèm sẵn), kết quả ghi dưới mục Thực thi.
- **Q4 ✅ VIẾT DOC:** [markup-edit.md](markup-edit.md).
- **Q5 ✅ GHI NHẬN RỠI ROỘNG:** GIF/SVG probe cần OpenAI API key (SVG là API-only; GIF có ở ChatGPT nhưng codex `$imagegen` trả PNG). Không có key → probe gộp quan sát vào REAL_SMOKE (xem format thật trả về) + hoãn probe API đến khi có key.
- **Q6:** claim landing/README chỉ khi có bằng chứng đo được, output codex không expose model id, nên claim "Images 2.6" trên đường plan KHÔNG thể verify từ phía mình; ghi ledger, không quảng cáo.

## TODO checklist

- [x] IM26-0: verify giá + model IDs + param markup/SVG/GIF từ docs chính thức (0 quota), giá $8/1M image tokens + $5/1M text tokens; phát hiện lane BYO không tồn tại trong UI
- [x] IM26-1: swap default `gpt-image-2.6-sunburst` + pin test (generation thật hoãn, không có BYO key; model-id từ changelog chính thức)
- [x] IM26-2: **REAL_SMOKE ĐÍNH CHÍNH + CHẠY ĐÚNG (2026-11-08)**: lần ghi "OK" 7/11 là smoke mock bị đọc nhầm thành real (script `pnpm smoke` set OIA_DESKTOP_SMOKE=1, smokeModeFromEnv check cờ này TRƯỚC, hạ mode im lặng; xem CORRECTION trong codex-pin.json). Chạy đúng (electron trực tiếp): pin 0.166.0 chưa có run real lại; **pin 0.167.0 FULL PASS 8/11**: job0 + DA_RESEARCH + DA_REFINE ALL_OK 439s. Lane generation khoẻ sau 2.6 rollout; model sau `chatgpt-imagegen` không đo được → không claim marketing
- [x] **Vòng probe codex (2026-11-08, owner "dùng codex đi")**: 3 probe thật trên pin mới, [bằng chứng đầy đủ](../research/im26-probes/README.md); tổng quota đợt 2 ảnh. Kết quả đổi 2 slice: SVG mở lại qua lane text (0 ảnh), ME markup edit chạy được trên lane codex (biến thể flatten)
- [x] IM26-3: design doc markup edit → [markup-edit.md](markup-edit.md)
- [x] IM26-4: quan sát trong smoke, output vẫn về PNG qua đường codex (không GIF); probe API GIF hoãn đến khi có key
- [ ] IM26-5: probe SVG, hoãn (API-only, cần key)
- [ ] IM26-6: complexity dial, hoãn (param API; không có lane BYO để gắn)
- [x] Q6: quyết định KHÔNG claim "Images 2.6" trên landing/README cho đường plan (model không đo được); README mô tả đúng khi lane BYO quay lại

## Rủi ro & lưu ý trung thực

1. **Mọi slice đốt quota thật đều chờ duyệt từng lần**: không chạy tự động (luật repo + tiền lệ D12).
2. **SynthID/C2PA không tắt được**: seller muốn banner "sạch dấu AI" sẽ thất vọng; ghi thẳng trong FAQ sau khi ship, không giấu.
3. **SVG/GIF limits chưa được docs hóa đầy đủ** bởi OpenAI, mọi hứa hẹn UI chờ probe.
4. **Đường codex có thể đổi hành vi ngầm** (server quay model sau `chatgpt-imagegen`), critic + smoke thật là lưới an toàn; không claim version model trên đường plan nếu không đo được.
5. Mock pair phải cover wire mới (markup field, output_format, complexity) **trước** khi đường thật chạy, lỗi-path gate theo luật repo, không happy-path only.
