---
type: Design
title: "Blueprint chi tiết: Oia đáp ứng công việc hình bán hàng"
status: proposed
generated: { by: agent, at: 2026-11-13T00:00:00Z }
---

# Blueprint chi tiết: Oia đáp ứng công việc hình bán hàng

## Vai trò của tài liệu

Mô tả cụ thể sản phẩm Oia sẽ như thế nào để phục vụ công việc của người bán, tổng hợp từ: hướng đã duyệt quy trình nghiên cứu ([seller-workflow-direction.md](seller-workflow-direction.md)), mẹo quy trình thị trường Trung Quốc ([china-ecommerce-workflows-research.md](china-ecommerce-workflows-research.md)), nguồn người thật R1-R5/V1 và hai vòng Goldfish. Vẫn là PROPOSED: chưa code tính năng mới, chưa ghi đè D1/D8/D12/D16/D18, mọi thay đổi quyết định chờ owner.

Nguyên tắc xuyên suốt: **mô tả bằng công việc của người dùng, không bằng danh sách công cụ.** Mỗi màn hình và đối tượng dưới đây ghi rõ: việc gì đang làm, thao tác gì, tốn quota hay không, sai thì sao.

## 1. Định vị một câu

> Oia là **bàn làm hình bán hàng trên máy tính**: nhập thông tin sản phẩm MỘT LẦN, tạo bộ ảnh đúng vai trò, sửa giá và ưu đãi mà không sinh lại ảnh, xuất đúng khổ sàn, và tuần sau mở lại cập nhật tiếp.

Không định vị: công cụ AI vẽ mọi thứ, web app cộng tác, công cụ cho người chỉ dùng điện thoại.

## 2. Mô hình đối tượng (điều người dùng thấy và tái dùng)

Bốn đối tượng, từ nhỏ đến lớn:

### 2.1 Hồ sơ sản phẩm (Product profile)

Mọi thứ bắt đầu từ đây. Một biểu mẫu ngắn, nội dung tiếng Việt, UI tiếng Anh theo D8:

```text
Product
  Name            Cà phê rang mộc MORI 250g
  Price           129.000đ
  Offer           Mua 2 giảm 10%
  Selling points  • Rang mới mỗi tuần
                  • Hương chocolate, hậu ngọt
  Attributes      Size: 250g / Roast: medium
  Photos          main-clean.jpg   (ảnh sạch, nền trắng/trơn)
                  angle-side.jpg   (tùy chọn)
                  detail-label.jpg (tùy chọn, cho ảnh chi tiết)
  Logo            mori-logo.png
  Lock notes      Không đổi màu bao bì, giữ con dấu rang
```

Quy tắc của biểu mẫu:

- Trường bắt buộc duy nhất: tên + ít nhất một ảnh. Còn lại để trống vẫn làm được việc.
- **Không tự điền thuộc tính chưa có.** Không bịa chứng nhận, chất liệu, xuất xứ. Ô trống hiển thị "not set" trong bộ ảnh chứ không hiện chữ giả.
- Ảnh chính được kiểm nhanh sau khi tải: phân giải thấp quá, mờ, nền lộn xộn thì gợi ý nhưng không chặn.
- Lock notes là văn bản tự do, được đưa vào mọi lời hướng dẫn AI sau này (ràng buộc mềm, kèm chính sách lớp cứng ở mục 7).
- Hồ sơ là **đối tượng lưu trữ**, không phải cuộc chat. Mở lại hôm sau vẫn còn.

Tại sao theo mô hình này: nguồn Trung Quốc 2026 cố định trường cấu trúc làm biến của cả quy trình (C17), seller thật mô tả mệt vì mỗi ảnh nhập lại yêu cầu (R1/R3), Goldfish hai vòng cùng chọn dữ liệu có cấu trúc trước batch. Cách điền nhanh (ảnh nhãn, dán text, URL, file Mass Upload sàn, MCP) thiết kế riêng tại [product-data-entry-research.md](product-data-entry-research.md).

### 2.2 Bộ ảnh (Image set)

Một sản phẩm có một bộ ảnh đang sống. Mỗi ảnh trong bộ có VAI TRÒ:

| Role | Nội dung | Nguồn gốc | Tốn AI? |
| --- | --- | --- | --- |
| Main | Sản phẩm + tên + giá | Ảnh thật + layout + chữ native | Không |
| Selling point | 1-2 điểm bán đã nhập | Chữ native + ảnh thật | Không |
| Detail | Ảnh chi tiết THẬT do người dùng cung cấp | Crop/chèn ảnh thật | Không |
| Offer | Ưu đãi + giá + thời gian | Chữ native | Không |
| Lifestyle (tùy chọn) | Sản phẩm trong bối cảnh | Ảnh thật làm lớp + nền AI | Có, hiện giá trước |

Điểm cứng: **ảnh chi tiết không bao giờ do AI vẽ ra rồi gọi là ảnh thật.** Không có ảnh phù hợp thì bộ ảnh hiển thị "Detail: needs photo" và cho phép bỏ role đó (C9: hàng không giống hình là rủi ro bán hàng thật, không phải chuyện thẩm mỹ).

### 2.3 Chiến dịch (Campaign)

Một bản chốt của bộ ảnh tại một thời điểm, có tên và ngày:

```text
Campaigns của MORI 250g
  ├── T11-2026 / launch          (đã chốt, khóa)
  ├── 20-11 flash sale           (đang làm)
  └── T12-2026 / Giáng sinh      (nháp)
```

Tạo chiến dịch mới = sao chép bộ hiện tại rồi đổi dữ liệu. **Không bao giờ sửa đè chiến dịch đã chốt.** Trả lời trực tiếp nỗi sợ "làm hỏng bản đang chạy" (R1: muốn đổi hàng loạt mà giữ khác biệt từng bản).

### 2.4 Shop / Bộ nhận diện (đã có Brand Kit)

Mỗi shop một bộ logo, màu, phông, guidance (schema `brandkit.ts` hiện hữu). Freelancer nhiều shop chuyển bộ nhận diện trước khi mở sản phẩm; bộ ảnh xuất luôn ghi lại shop nào, chống lẫn khách (persona B, vòng Goldfish 1). Ghi phạm vi v1: chưa có grouping "shop" riêng ngoài project; chuyển brand kit là cơ chế tạm, mở lại khi dữ liệu thật cho thấy lẫn khách (ghi trong execution-plan mục đỗ lại có chủ đích).

## 3. Màn hình và luồng chính

### 3.1 Home: chọn việc trước, chọn mẫu sau

Home hôm nay là composer prompt-first. Home theo blueprint có hai lớp:

**Lớp 1, bốn thẻ việc (luôn hiển thị, không cần provider):**

```text
[ New product images ]   [ Update a campaign ]   [ Livestream overlays ]   [ Open recent ]
```

- New product images: mở biểu mẫu hồ sơ 2.1.
- Update a campaign: chọn sản phẩm + chiến dịch hiện có.
- Livestream overlays: vào preset trong suốt đã có (C3 stage cũ, giữ nguyên).
- Open recent: bộ ảnh đang làm dở.

**Lớp 2, gallery mẫu hiện có** giữ nguyên chỗ cũ, phục vụ người muốn bắt đầu từ mẫu. Một chip trạng thái runtime đã có (`trial-chip`) báo rõ mock; không có tài khoản vẫn dùng được toàn bộ lớp 1 với mẫu native.

Không xóa composer prompt. Nó lui về một nút "Describe it instead" cho người thích gõ.

### 3.2 Luồng A: đăng sản phẩm mới (lần đầu đầu tư, dùng lại mãi)

Bước từng màn hình:

1. **Form hồ sơ** (2.1). Điền xong bấm Continue.
2. **Chọn bộ layout.** Oia gợi ý 4-6 bộ bố cục PHÙ HỢP NGÀNH (đồ uống ấm, mỹ phẩm, đồ gia dụng...) thay vì 35 mẫu phẳng. Mỗi bộ xem trước bằng đúng ảnh/tên/giá vừa nhập. Chọn một bộ.
3. **Sinh bộ nháp, 0 lượt AI.** Năm trang tạo ra từ layout + dữ liệu: main, selling point, detail (nếu có ảnh), offer. Tất cả chữ là Textbox native sẵn sàng sửa.
4. **Bảng duyệt bộ (Review board).** Ảnh xếp cạnh nhau, mỗi ảnh có trạng thái:

   ```text
   ✓ Main       ready
   ✓ Offer      ready
   ⚠ Detail     missing photo (bỏ role hoặc thêm ảnh)
   ⚠ Selling pt "Rang mới mỗi tuần" tràn 12% khung chữ (bấm sửa tại chỗ)
   ```

   Đây là trái tim của blueprint: **cảnh báo theo dòng dữ liệu trước khi xuất**, không âm thầm cắt chữ (R4/R5). Sửa trực tiếp trên bảng, không phải mở từng trang tìm.
5. **Nâng cấp có chọn lọc, từng cái một.** Mỗi ảnh có nút "AI background" hiện giá (`1 image`) trước khi chạy. Ảnh đầu AI của bộ phải qua tay người dùng duyệt rồi mới gợi ý chạy tiếp các ảnh khác (mẹo validate-first, C17). Kết quả AI luôn về dạng preview, áp vào từng lớp, không đụng lớp sản phẩm (mục 7).
6. **Xuất bộ** (mục 5).

Thời lượng mục tiêu nội bộ cho luồng A: dưới 10 phút cho bộ 4 ảnh không AI trên profile đã quen. Con số tham khảo nội bộ, không phải cam kết marketing.

### 3.3 Luồng B: cập nhật chiến dịch (việc lặp, nơi Oia phải thắng)

Tuần sau, người dùng mở "Update a campaign":

1. Chọn MORI 250g, chiến dịch T11-2026, bấm **Duplicate to new campaign**.
2. Đổi ba trường trên biểu mẫu: giá 119.000đ, offer "Freeship từ 2 túi", ngày 20-22/11.
3. **Bảng khác biệt (diff):** Oia liệt kê ảnh nào đổi, ảnh nào giữ:

   ```text
   Main    price + offer sẽ đổi    (chữ native, 0 ảnh)
   Offer   toàn bộ sẽ đổi          (chữ native, 0 ảnh)
   Detail  không đổi
   Lifestyle nền giữ nguyên        (không chạy lại AI)
   ```

4. Xem trước, sửa nốt chỗ tràn chữ, xuất.

Toàn bộ 0 lượt AI, 0 quota, dưới 2 phút. **Đây là lời hứa khác biệt thật sự** vì Canva Bulk Create của người dùng R5 bị phá cấu trúc xuất, còn V1 (đóng khung) chỉ ghép khung chứ không hiểu giá/ưu đãi là dữ liệu.

### 3.4 Luồng C: gói thử A/B (một trục)

Từ chiến dịch đang chốt, "Create test variants":

- Oia tạo 2-3 bản khác ĐÚNG MỘT trục: bố cục (sản phẩm giữa so với lệch trái), hoặc thông điệp chính (giá so với freeship), hoặc phong cách nền.
- Đặt tên file rõ: `main-A-centered.png`, `main-B-price-first.png`.
- Xuất kèm một dòng ghi chú trong manifest để seller tự tra trên sàn.

Không tích hợp A/B của sàn (C18 chỉ xác nhận sàn có công cụ riêng; Oia không cần chờ hay gọi API đó).

### 3.5 Luồng D: lô nhỏ nhiều sản phẩm (slice sau, không phải v1 của blueprint)

Sau khi A/B ổn: bảng 3-5 dòng ngay trong app (không CSV file), mỗi dòng = hồ sơ tối thiểu. Cùng bảng duyệt cảnh báo từng dòng. Giới hạn lô do benchmark bộ nhớ quyết, không chốt trước con số.

### 3.6 Chat AI nằm ở đâu

Mọi luồng trên đều có nút **Ask AI** trong ngữ cảnh: đang nhìn ảnh main thì hỏi "nền sáng hơn", đang ở bảng duyệt thì hỏi "gợi ý cách xếp 2 điểm bán". Chat là công cụ trong công việc, không phải cửa vào duy nhất. Những việc cần CHÍNH XÁC (giá, tên, ngày) luôn có control trực tiếp, không đi qua chat.

## 4. Editor trong blueprint (mở rộng cái có, không dựng lại)

Editor hiện tại giữ nguyên vai trò: canvas lớp, ContextToolbar, crop, remove background, split layer, Make text editable. Thêm đúng hai thứ:

1. **Khay vai trò (role rail):** cột nhỏ liệt kê các ảnh của bộ đang mở, bấm chuyển nhanh, trạng thái cảnh báo đi theo.
2. **Biểu tượng khiên trên lớp sản phẩm:** lớp ảnh đến từ hồ sơ sản phẩm có nhãn `product asset`. Người dùng vẫn chỉnh được tay, nhưng mọi lệnh AI sửa nền/repaint phải ghi rõ "product layer untouched" hoặc yêu cầu xác nhận tường minh nếu muốn đụng vào nó.

## 5. Xuất file: hợp đồng bàn giao

Hộp thoại Export (mở rộng planExport hiện có):

```text
Destination: [Shopee 1:1] [Lazada 1:1] [TikTok Shop] [Story 9:16]  (chọn nhiều)
Include:     [x] Main  [x] Offer  [ ] Detail  [ ] Lifestyle
Naming:      mori-250g_t11/main-shopee-1024.png
```

Quy tắc cứng:

- Tên file deterministic từ slug sản phẩm + role + khổ. Chạy lại cùng dữ liệu ra cùng tên, không tạo `main (2).png` (R5: cấu trúc xuất là hợp đồng với quy trình sau).
- Kèm `manifest.json`: role, khổ, hash, chiến dịch, ngày, template version. Ai cần đối chiếu thì có.
- Layout theo khổ lấy từ bộ layout khai báo sẵn. Mẫu chưa có layout cho khổ đó thì hiện "not available at this size", mời về editor chỉnh tay, **không tự crop** (C15/C16: thị trường đã chuyển đa khổ về giai đoạn dựng bố cục).

## 6. Phân phối năng lực AI: cái gì chạy đâu, giá bao nhiêu

| Thao tác | Máy AI? | Giá hiển thị |
| --- | --- | --- |
| Đổi chữ native, đổi ảnh thật, layout, xuất | Không | 0 |
| Nền/bối cảnh AI cho một ảnh | Provider | 1 image, preview trước |
| Auto-refine sau sinh (đã có) | Provider | đọc critic, có vòng giới hạn |
| Make text editable trên ảnh phẳng (đã có) | Provider | 1 image + tối đa 6 reads |
| Remove background | rembg local | 0, thiếu công cụ thì nói rõ cách cài |
| Split layer | SAM sidecar local | 0 model tải lần đầu |

Nguyên tắc: **mỗi dòng bảng này người dùng thấy được trước khi bấm.** Không có hành động nào âm thầm gọi provider. Thiếu công cụ local thì UI nói thiếu gì, không giả lỗi mơ hồ (bài học OpenDesign #9426: thất bại câm là thất bại nguy hiểm nhất).

## 7. Bảo vệ sản phẩm thật (chính sách, không chỉ khóa canvas)

Ba lớp phòng thủ, từ ngoài vào:

1. **Prompt (mềm):** lock notes của hồ sơ + hợp đồng edit hiện có (A3-lite) đi vào mọi yêu cầu AI.
2. **Cấu trúc (cứng):** lớp product asset là nguồn riêng, lệnh "đổi nền/chỉnh vùng" chỉ nhận vùng ngoài lớp đó. Kết quả AI áp qua preview/apply từng lớp như variant hôm nay.
3. **Kiểm chứng (sau xuất):** gate nội bộ so hash asset nguồn trước/sau mỗi thao tác AI; nếu src lớp sản phẩm đổi mà không có xác nhận tường minh thì tác vụ fail toạc và ghi log.

Không hứa pixel xuất tuyệt đối giống: nén, resize vẫn đổi byte. Invariant cam kết là: **asset nguồn không đổi, không méo tỷ lệ, không bị crop/che ngoài lựa chọn đã duyệt.**

## 8. Người dùng type nào được phục vụ trước

| Nhóm | Được gì ngay | Không được gì (công khai) |
| --- | --- | --- |
| Seller 1 shop, máy tính, cập nhật tuần | Luồng A/B trọn, 0 quota cho phần lặp | Không có app điện thoại, không tự đăng sàn |
| Freelancer nhiều shop | Bộ nhận diện theo shop + manifest bàn giao | Không có share link/collab (SG-17 giữ đóng) |
| Seller chính điện thoại | Trang cài nói rõ yêu cầu máy tính, tự loại sớm | Không dựng web/mobile (D1) |

## 9. Bản đồ có/sắp có (đối chiếu mã ngày 13/11/2026)

| Thành phần blueprint | Trạng thái |
| --- | --- |
| Mẫu 35 + chữ native + gallery | Có (`studio-templates`, Home) |
| Brand kit | Có (`brandkit.ts`) |
| Editor lớp, crop, remove-bg, split, deconstruct | Có |
| Xuất đa định dạng + planExport | Có (`actions.ts`) |
| Critic/auto-refine/research-informed planning | Có (`designer.ts`) |
| Mock/minh bạch quota/price-first | Có |
| **Hồ sơ sản phẩm (đối tượng + form + store)** | Mới, slice S2a |
| **Bộ ảnh theo role + role rail + bảng duyệt** | Mới, slice S2b |
| **Trường gắn layout (binding theo ID lớp)** | Mới, slice S3 |
| **Chiến dịch: duplicate + diff + khóa bản chốt** | Mới, slice S5 |
| **Gói A/B một trục + manifest** | Mới, sau S3 |
| **Chính sách product asset 3 lớp + gate hash** | Mới, S2 |
| Gói lô nhỏ trong app | Sau, có benchmark |

Thứ tự triển khai đề xuất giữ như hướng đã ghi: S0/S1 trước (chạy thật đường có sẵn trên profile sạch), rồi S2a (hồ sơ + bảo vệ asset) là viên gạch đầu tiên của phần mới, vì cả bộ ảnh lẫn chiến dịch đều đứng trên nó.

## 10. Câu chuyện một tuần của người dùng (bản tóm cho README/sau này)

- Thứ Hai: nhập hồ sơ MORI, chọn bộ layout, duyệt bộ 4 ảnh, thêm 1 nền AI cho main (1 image), xuất 3 khổ.
- Thứ Tư: thấy nền main hơi tối, mở editor, nói "sáng hơn" (1 image), áp vào lớp nền, lớp sản phẩm không đổi.
- Thứ Sáu: dup chiến dịch thành "flash 20-11", đổi giá + freeship (0 image), xuất 2 phút.
- Tuần sau: sản phẩm Decaf, dùng lại bộ layout, đổi ảnh + tên + giá (0 image cho 3/4 ảnh).

Đó là sản phẩm đáp ứng nhu cầu: **đầu tư một lần, thu hoạch mỗi tuần.**

## 11. Giới hạn công khai (không giấu)

- Font khớp từ ảnh phẳng vẫn xấp xỉ; Make text editable có thể chừa vệt (D22).
- Ảnh raster không repaint bên trong; chỉnh từng điểm ảnh trong ảnh là thao tác AI có giá.
- Windows chưa qua máy vật lý đủ; Lens license chưa xử lý trước khi tính phí.
- Đa khổ chỉ với layout khai báo; không tự chế bố cục mới.

## 12. Gates khi triển khai (theo từng slice)

- S1: packaged smoke profile sạch + ảnh thật tiếng Việt dài + xuất mở lại đúng.
- S2a/S2: gate hash asset qua mọi lệnh AI; cancel/giữ nguyên; 1 lượt provider thật xác nhận tích hợp nền.
- S3: dữ liệu xấu/tràn/thiếu, restart giữa lô, tên file đặc biệt, 0 AI cho lô từ mẫu.
- S5: chiến dịch cũ bất biến sau mọi thao tác; mở lại sau crash.
- Mỗi slice kèm shot gate UI thật (rule repo: view không có shot là chưa xác minh).

Chỉ tài liệu. Không code, không gate đã chạy trong vòng này. `git diff --check` sạch.
