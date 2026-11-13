---
type: Research
title: "Nghiên cứu: người dùng lưu thông tin sản phẩm ở đâu và Oia nhập nhanh nhất thế nào"
status: research
generated: { by: agent, at: 2026-11-13T00:00:00Z }
---

# Nghiên cứu nhập dữ liệu sản phẩm vào Oia

## Câu hỏi

1. Người bán đang lưu thông tin sản phẩm ở đâu hôm nay?
2. Oia giúp đưa dữ liệu đó vào hồ sơ sản phẩm nhanh nhất bằng cách nào, kể cả đường AI/agent/MCP?

Chỉ nghiên cứu nguồn công khai + đối chiếu mã Oia. Không dùng khảo sát trực tiếp làm dependency. Không triển khai gì trong vòng này.

## Phần 1: Dữ liệu sản phẩm đang nằm ở đâu

### N1. File Mass Upload của chính sàn là "kho dữ liệu" de facto

- Shopee Seller Education: Mass Upload dùng template Excel/CSV, seller điền thông tin rồi tải lên ([seller.shopee.ph](https://seller.shopee.ph/edu/article/24858), hướng dẫn cập nhật 09/05/2025).
- TikTok Shop Seller University: bulk listing bằng Excel template, chỉ desktop, template đổi theo phiên bản từ 06/2025 ([seller-us.tiktok.com](https://seller-us.tiktok.com/university/essay?knowledge_id=428445525411626)).
- Amazon Seller Central: bulk listing template xlsx ([sellercentral.amazon.com](https://sellercentral.amazon.com/help/hub/reference/external/GZ4ZQ4HZQM2R4B2X)).

Hàm ý quan trọng nhất của nghiên cứu này: **nhiều seller nhỏ đã có sẵn một file Excel/CSV chứa tên, giá, mô tả, biến thể của toàn bộ shop**, vì đó chính là công cụ đăng hàng loạt họ đang dùng. File đó thường nằm trong Downloads hoặc Google Drive và được cập nhật mỗi đợt đăng. Với Oia, đây là nguồn dữ liệu có sẵn, hợp pháp (file của chính họ), không cần scraping.

Giới hạn bằng chứng: đây là tài liệu chính thức của sàn về template; chưa đo được tỉ lệ seller giữ file sau khi upload. Mức phổ biến là suy luận từ cơ chế nền tảng, không phải thống kê.

### N2. Trung Quốc: gói dữ liệu nhà cung cấp (CSV + ảnh nén) là chuẩn mực phân phối

- Giải thích dữ liệu sản phẩm Taobao: xuất ra file CSV/data, đại lý nhập trực tiếp để đăng, không phải soạn lại từng món ([jingyan.baidu.com](https://jingyan.baidu.com/article/59703552ea2bfb8fc0074014)).
- Cách lấy/nhập CSV qua công cụ hỗ trợ xuất ([jiaohuiyun.com](https://www.jiaohuiyun.com/help/article/467)).
- Bách khoa ngành 2026: nhà cung cấp phát hành gói dữ liệu cho đại lý nhập hàng loạt ([ai-indeed.com](https://www.ai-indeed.com/encyclopedia/6485.html), 13/07/2026).
- Hướng dẫn phần mềm gom hàng 2026: đọc gói dữ liệu, tự map trường, rồi BẮT BUỘC xem trước kết quả nhập (loại, quy cách, giá, tồn) trước khi đăng ([bbs.csdn.net](https://bbs.csdn.net/weixin_28837817/article/details/100726988), 29/10/2026).

Hàm ý: chuỗi cung ứng đã giải quyết "nhập dữ liệu + ảnh hàng loạt" từ phía nhà cung cấp bằng CSV + thư mục ảnh, kèm bước xem trước mapping. Đúng bài toán Oia cần cho lô nhỏ nhiều SKU.

### N3. Việt Nam: ERP đa kênh và sao chép listing

- Sapo, KiotViet, Nhanh, Haravan là nơi shop nhiều kênh giữ sản phẩm, tồn kho, giá; đều có nhập/xuất Excel (tài liệu từng hãng, chưa đọc chi tiết trong vòng này).
- AutoShopee Kit quảng cáo sao chép sản phẩm đa sàn, tải ảnh/video sản phẩm về máy ([blog.autoshopee.com](https://blog.autoshopee.com/thiet-ke-khung-anh-san-pham-dong-khung-hang-loat), đã đọc ở vòng V1). Tức là việc "lấy listing về máy" đã được thương mại hóa ở VN; rủi ro pháp lý/điều khoản khi copy sản phẩm người khác vẫn thuộc về người dùng.

### N4. Các nơi lộn xộn hơn (không có nguồn đọc được, ghi như giả thuyết từ persona + nguồn gián tiếp)

Zalo với nhà cung cấp (báo giá dạng text/ảnh), bảng Google Sheets tự giữ, ảnh chụp bảng giá, giấy note tại kho. V1 (blog AutoShopee) xác nhận tồn tại nhu cầu "tải trọn bộ ảnh sản phẩm về máy", phần còn lại là giả thuyết persona: không dùng làm bằng chứng thị trường, chỉ dùng để thiết kế cửa nhập.

### Tổng hợp: năm nơi dữ liệu có thể đến

| Nguồn | Dạng | Độ tin | Ghi chú pháp lý/kỹ thuật |
| --- | --- | --- | --- |
| File Mass Upload sàn | Excel/CSV có cấu trúc | Cao | File của chính seller, an toàn |
| Xuất từ ERP VN | Excel/CSV | Cao | Cần map cột từng hệ |
| Gói NCC kiểu TQ | CSV + ZIP ảnh | Cao | ZIP phải kiểm kích thước/entry/path |
| Text/photo báo giá | Chuỗi text, ảnh nhãn | Trung bình | AI đề xuất, người duyệt |
| Listing trên sàn (URL) | Trang web | Trung bình | ToS sàn, anti-bot; ưu tiên export chính chủ |

## Phần 2: Oia nhập nhanh nhất bằng cách nào

### Kiểm kê năng lực hiện có (đối chiếu mã 13/11/2026)

- Loopback agent API (D9): `POST /api/tasks/:type`, upload, `GET /api/files/:key`, cancel; auth key qua header; **chưa có** route hồ sơ sản phẩm hay MCP (`apps/desktop/src/utility/loopback.ts`).
- 14 skill agent đọc discovery file `agent-api.json` tự động (`packages/skills/`).
- Vision đọc ảnh có schema JSON (B1/D22): đường OCR + read có sẵn, đang dùng cho deconstruct.
- Planner LLM có sẵn (codex/openai), đã parse JSON kế hoạch.
- `importWebData.ts` là nhập corpus web cũ, không liên quan sản phẩm.
- Chưa có bất kỳ MCP server nào trong repo (chỉ nhắc trong doc cũ).

### Sáu cửa nhập, xếp theo (giá trị x công sức x rủi ro)

#### Cửa 1. Nhập từ chính file Mass Upload của sàn (khuyên làm đầu tiên cùng cửa 2)

Seller chọn file xlsx/csv Shopee/TikTok họ vẫn dùng đăng hàng. Oia parse local, map cột (tên, giá, mô tả, biến thể, URL ảnh), hiện bảng xem trước: dòng nào thiếu gì, ảnh cần tải separately hay người dùng chọn trong máy. Chọn dòng → tạo hồ sơ.

- Không tốn AI, không scraping, dữ liệu cấu trúc sẵn.
- Công việc "tải ảnh từ URL trong file" cần fetch ảnh: ghi rõ chỉ tải ảnh công khai do seller cung cấp, lỗi mạng thì để người dùng chèn tay.
- Rào: parser cột phiên bản template đổi (TikTok đổi 06/2025) → mapping phải do người dùng xác nhận, không map mù.

#### Cửa 2. Ảnh trước, AI đọc sau (dùng đúng năng lực mạnh có sẵn)

Người dùng thả 1-3 ảnh: ảnh nhãn sản phẩm, ảnh chụp bảng giá, ảnh listing trên màn hình. Oia chạy đúng một lượt vision read schema hóa (cơ chế B1) trích: tên, giá, đơn vị, thông số. Kết quả đổ vào form dạng **đề xuất từng trường, hover xem vùng ảnh nguồn**, người dùng duyệt/sửa rồi lưu. Giá và số tiền luôn highlight bắt buộc nhìn lại.

- Chi phí: 1 read/ảnh, hiện giá trước khi chạy.
- Trung thực: OCR dấu tiếng Việt có ngưỡng sai (đã ghi D22); các trường đọc được đánh độ tin, trường thiếu để trống chứ không đoán.
- Đây là cửa hợp persona "dữ liệu nằm trong ảnh/Zalo" mà không cần ai gõ lại.

#### Cửa 3. Dán text (Zalo báo giá, mô tả NCC)

Ô "Paste product info": dán đoạn text lộn xộn, planner LLM (đã có) parse sang trường schema, cùng giao diện duyệt như cửa 2. Một lượt LLM, rẻ hơn read ảnh. Có thể gộp chung một màn "assisted fill" với cửa 2.

#### Cửa 4. Gói NCC CSV + ZIP ảnh (sau lô nhỏ, kế thừa pattern Trung Quốc)

Nhập như cửa 1 nhưng kèm giải nén ảnh vào kho asset, map ảnh theo tên file/cột. Bắt buộc các rào đã ghi trong blueprint: giới hạn entry, chống zip bomb, chống path traversal, tên file Windows. Chỉ mở khi lô nhỏ đã ổn.

#### Cửa 5. MCP server + agent làm hộ (đòn bẩy agent-native)

Oia chạy một MCP server nhỏ trong utility process, tái dùng nguyên lớp bảo mật D9 (127.0.0.1, key qua env, không Origin) và discovery file sẵn có. Tools đề xuất:

```text
oia_upsert_product_profile   (tạo/sửa hồ sơ: tên, giá, offer, điểm bán, ảnh)
oia_list_product_profiles
oia_create_image_set         (chọn bộ layout, sinh nháp 0-AI)
oia_get_set_status / oia_export_set
```

Khi đó người dùng nói với agent của họ: "mở file GIANHANG.xlsx trong Downloads, tạo hồ sơ cho 5 món cà phê, bộ layout tối giản" và agent gọi MCP. Tiền lệ thị trường: OpenDesign phân phối `od mcp install` cho hơn 20 agent; Gaoding có CLI sáng tạo bằng lệnh; Meitu vào thẳng Qianniu (C10). Oia đã có 80% hạ tầng (loopback + discovery + skills), thiếu đúng lớp hồ sơ.

Lưu ý trung thực: MCP phục vụ nhóm biết dùng coding agent (nhóm freelancer/persona B), không phải đa số seller; nó là tầng tăng tốc trên nền cửa 1-3, không thay thế UI.

#### Cửa 6. Dán URL listing (owner duyệt làm, 13/11/2026)

Thiết kế sau khi owner chốt làm luôn, kèm rào:

- **Đường trong app:** dán link Shopee/TikTok Shop/Lazada → Oia fetch trang công khai (chỉ đọc meta/JSON-LD chuẩn og:, không giả lập trình duyệt, không vượt anti-bot, không dùng cookie đăng nhập) → trích tên, giá, ảnh → đổ vào đúng màn assisted fill của cửa 2/3 để duyệt từng trường. Trang đổi cấu trúc hoặc chặn thì báo rõ "không đọc được, dán tay hoặc dùng file Mass Upload", không thử vô hạn.

- **Đường agent (mạnh hơn):** agent của người dùng có công cụ web sẵn, đọc URL ở ngoài rồi gọi MCP `oia_upsert_product_profile` (cửa 5). Oia không tự gánh việc scraping khó; đây là lý do MCP đáng làm cùng lúc.

- **Rào trung thực:** cảnh báo điều khoản sàn ngay tại ô dán; khuyến nghị đường chính chủ (file Mass Upload của chính shop) trước URL; copy listing người khác là quyết định của người dùng, Oia không che giấu rủi ro và không bán tính năng bằng khẩu hiệu "chôm listing".

- **Rate limit + cache:** giới hạn số fetch mỗi phiên, cache theo URL; không biến Oia thành crawler.

### Nguyên tắc chung cho mọi cửa AI

- **Đề xuất, không tự điền 100%**: mọi trường do AI/OCR/LLM trích đều qua duyệt, nguồn gốc (ảnh/vùng/dòng) xem được.
- **Không bịa thuộc tính**: thiếu là thiếu, không sinh chứng nhận/chất liệu/xuất xứ (nguyên tắc blueprint giữ nguyên).
- **Giá là dữ liệu đặc biệt**: highlight bắt buộc nhìn lại; sai giá là lỗi nghiêm trọng nhất (R4/R5).
- **0 AI vẫn vào được**: cửa 1 không tốn model nào; assisted fill là tùy chọn có giá.

## Phần 3: đề xuất sequence

1. Cùng slice S2a (hồ sơ sản phẩm): làm cửa 2+3 chung một màn "assisted fill" vì dùng chung giao diện duyệt và hạ tầng read/LLM có sẵn; cửa 1 (parser Mass Upload) làm ngay sau vì không phụ thuộc AI.
2. S2b (bộ ảnh) dùng hồ sơ từ bất kỳ cửa nào: dữ liệu vào là một.
3. Cửa 6 (URL) gộp vào assisted fill theo thiết kế trên, đường trong app là best-effort meta/JSON-LD; đường agent chạy được ngay khi cửa 5 có MCP.
4. Sau lô nhỏ: cửa 4 (ZIP NCC).
5. Khi hồ sơ store đã ổn: cửa 5 (MCP) như một interface mỏng trên loopback; công bố kèm skill hướng dẫn như 14 skill hiện có.

## Nguồn

Đã liệt kê URL kèm ngày ngay trong các mục N1-N3. Nguồn N4 là giả thuyết persona, không phải bằng chứng thị trường. Không đọc được nội dung trang CSDN đầy đủ (chỉ đoạn tìm kiếm), phần được dùng chỉ là mô tả quy trình xem trước mapping.

Vòng này chỉ nghiên cứu và tài liệu. Không code, không gate chạy, không phát sinh chi phí. `git diff --check` sạch.
