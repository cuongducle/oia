---
type: Design
title: "Hướng giải quyết công việc lặp của người bán"
status: proposed
generated: { by: agent, at: 2026-11-13T00:00:00Z }
---

# Hướng giải quyết công việc lặp của người bán

## Trạng thái và phạm vi

Đề xuất để owner duyệt, chưa đổi mặc định D16, chưa mở lại D8, chưa code tính năng. Không lấy khảo sát, phỏng vấn hoặc tuyển người dùng làm dependency. Không tự mua chứng chỉ, dịch vụ hay model. Gate kỹ thuật và dữ liệu thật vẫn giữ.

Nghiên cứu công khai và mô phỏng persona là hai loại bằng chứng khác nhau. Hồ sơ nghiên cứu riêng tư: `docs/private/product-direction-2026-11-13/`, gồm nguồn đã đọc và báo cáo Goldfish độc lập. Chỉ là phiên nhập vai/phản biện tập trung, không tuyên bố đã chạy đầy đủ năm bước review thiết kế EGM.

## Vấn đề trước, tính năng sau

Oia có sinh ảnh, canvas, mẫu, công cụ ảnh và API, nhưng chưa có một hợp đồng công việc đủ rõ từ thông tin sản phẩm đến bộ hình cập nhật được. Đuổi theo danh sách chức năng đối thủ có thể làm sản phẩm rộng hơn mà không giảm số thao tác của người bán.

Luận điểm đề xuất: làm tốt việc cập nhật hình bán hàng từ tài sản có sẵn, giữ đúng sản phẩm và thông tin. Sinh ảnh tự do tiếp tục tồn tại, không phải mọi thao tác đều bắt buộc đi qua AI.

### Bằng chứng người thật và phản chứng

| Nguồn | Điều quan sát được | Không suy rộng thành |
| --- | --- | --- |
| [R1](https://www.reddit.com/r/canva/comments/11cujkn/bulk_edit_multiple_pages/) | Tác giả muốn cập nhật chung hơn 200 trang nhưng giữ khác biệt từng trang | Canva hiện tại chắc chắn không có cách làm |
| [R2](https://www.reddit.com/r/productphotography/comments/16pbuch/how_do_you_edit_product_photos_in_bulk/) | Tác giả hỏi xóa nền, đặt kích thước và xử lý ảnh hàng loạt | Mọi người bán cần AI hoặc sẵn lòng trả tiền |
| [R3](https://www.reddit.com/r/canva/comments/1rimvsa/is_there_a_way_to_automate_700_product_images/) | Một cửa hàng có bảng dữ liệu và ảnh, cần một dòng tương ứng bảy trang | Quy mô điển hình của seller Việt là 700 ảnh |
| [R4](https://www.reddit.com/r/canva/comments/1rk9bj6/does_bulk_create_actually_speed_up_social_media/) | Người cân nhắc đổi công cụ lo phải chỉnh khung chữ từng trang | Có số đo chứng minh tự động hóa chậm hơn |
| [R5](https://www.reddit.com/r/canva/comments/1oqlblu/bulk_create_changed_and_fed_up_my_entire_process/) | Tác giả báo cấu trúc xuất thay đổi phá quy trình sau và chữ xuất lệch preview | Lỗi còn tồn tại trên bản mới nhất |
| [V1](https://blog.autoshopee.com/thiet-ke-khung-anh-san-pham-dong-khung-hang-loat) | Nhà cung cấp Việt chào bán đóng khung hàng loạt, có bản trên trình duyệt miễn phí | Bằng chứng độc lập về doanh thu hay hiệu quả |

Ngày đọc: 13/11/2026. Reddit là lời kể tự nhận, một số bài cũ; không xác nhận danh tính, tần suất thị trường hoặc giới hạn công cụ hiện tại. V1 là nội dung của nhà cung cấp. Chưa đủ nguồn độc lập để khẳng định nhu cầu trả tiền ở Việt Nam. Trang trợ giúp Canva bị chặn trình đọc nên không dùng để kết luận giới hạn hiện tại.

## Bổ sung thị trường Trung Quốc (2026-11-13)

Owner yêu cầu ưu tiên tham chiếu Trung Quốc bên cạnh nguồn Việt Nam và quốc tế. [Hồ sơ nghiên cứu](china-ecommerce-workflows-research.md) phân loại nguồn chính thức Meitu/Gaoding, thảo luận V2EX, báo chí và bài quảng bá. Không dùng thông số quảng cáo hay doanh thu toàn tập đoàn làm bằng chứng hiệu quả của công cụ cụ thể.

Phát hiện bổ sung: **một sản phẩm ra bộ ảnh có vai trò khác nhau** (ảnh chính, điểm bán, chi tiết, ưu đãi) khác với **nhiều SKU dùng cùng bố cục**. Đề xuất ứng viên bộ ảnh nhỏ dùng tài sản thật và dữ liệu đã xác nhận, xem xét cạnh biến thể lô nhỏ sau khi S0/S1 có baseline. Chưa mở thêm cả hai hướng. Ảnh chi tiết không được tự sinh rồi gọi ảnh thật; thông số, chứng nhận và màu SKU phải có xác nhận. Không tự tích hợp sàn, sao chép tài sản đối thủ hay thêm cơ chế lách phát hiện ảnh trùng.

## Persona giả thuyết

- Người bán làm việc trên desktop, thường đổi giá/ưu đãi của một số sản phẩm: cần ít bước và không sai giá, chưa chắc cần CSV.
- Người làm hình cho nhiều shop: cần lưu bộ nhận diện, xuất có tên file ổn định, không lẫn dữ liệu shop.
- Người bán chủ yếu dùng điện thoại: có thể từ chối tải app và đăng nhập provider. Không cố phục vụ bằng cách lén mở lại scope web/mobile; ghi rõ ngoài nhóm đầu tiên.

Đây là giả thuyết nhập vai, không phải người tham gia thực tế.

## Kiểm kê mã thực tế

- `apps/desktop/src/renderer/views/Home.tsx`: gallery đã có đường suy giảm không cần provider và `trial-chip` báo ảnh mock. P0 là xác minh và giảm ma sát của đường có sẵn, không khẳng định app đang khóa toàn bộ khi thiếu tài khoản.
- `packages/canvas/src/pages.ts`: có nhân trang, mỗi trang giữ scene riêng; chưa có ánh xạ dòng dữ liệu thành biến thể sản phẩm. `applySizeToAllPages` đổi kích thước clip, không chứng minh bố cục tự thích nghi.
- `apps/desktop/src/renderer/views/Editor.tsx`: có đổi ảnh chọn, chữ native, mẫu, đổi kích thước và xuất trên canvas riêng. Không đồng nhất đổi artboard với tái bố cục có kiểm chứng.
- `packages/canvas/src/layers.ts`: có khóa đối tượng được lưu. Khóa chọn/di chuyển không phải chính sách cấm đường AI vẽ lại sản phẩm.
- `packages/schema/src/brandkit.ts`: có logo, màu, phông, guidance. Chưa có hợp đồng trường giá/tên/ưu đãi theo chiến dịch.
- `packages/tasks/src/processors.ts`: xóa nền gọi CLI rembg ngoài app, lỗi nếu chưa cài. Chưa có trải nghiệm cài sẵn cho mọi máy.
- `packages/agent/src/designer.ts`: có ảnh tham chiếu, poster/clean-plate và critic có giới hạn. Prompt bảo toàn sản phẩm không bảo đảm pixel sản phẩm được giữ.
- `apps/desktop/src/utility/loopback.ts`: có task/upload/files, chưa có hợp đồng project CRUD và xuất canvas native đủ cho script biến thể chiến dịch. Không coi batch qua API hiện tại là việc chỉ thêm một script.
- `apps/desktop/electron-builder.yml`: đóng Lens vào app. NOTICE hạn chế phi thương mại là ràng buộc cần xử lý, không được coi giấy phép MIT của repo bao trùm model.
- `docs/designs/surgepix-parity-todo.md` là sổ nợ, có mục lịch sử cũ; phải đối chiếu D22 mới và code trước khi lấy từng mục lên làm.

## Hướng giải quyết theo ưu tiên

### P0: một đường hoàn thành việc thật không cần provider

Dùng mẫu native + thay ảnh thật + sửa giá/ưu đãi + xuất. Đây là gom và làm rõ các năng lực đã có, không dựng engine sinh ảnh khác.

- Từ điểm bắt đầu, tách rõ dùng mẫu không AI và tạo/sửa bằng AI. Không đổi mặc định poster của D16; đường mẫu là công việc riêng.
- Cho biết thao tác nào miễn quota, thao tác nào cần model/tài khoản hoặc cài thêm công cụ.
- Thư viện mẫu cần nêu đúng đối tượng nào sửa được; không lấy chữ baked trong ảnh quảng cáo làm ví dụ chữ native.
- Kiểm luồng trên profile mới, không có provider, không có rembg, không model tải sẵn. Người dùng vẫn mở mẫu, thay ảnh không tách nền, sửa chữ và xuất được.
- Giữ trạng thái mock minh bạch: Home hiện đã có `trial-chip` kèm lời giải thích ảnh placeholder, không ghi đây là lỗi fallback câm đang tồn tại. Slice này kiểm mức dễ nhận biết và đường chuyển sang mẫu, không xóa hay lặp lại cơ chế đã có.

Gate: luồng UI Electron thật với provider không sẵn sàng, ảnh thật và chữ Việt dài, xuất mở lại đúng. Nhánh lỗi công cụ phụ không làm mất ảnh/chữ. Có file đầu ra để kiểm bằng mắt, không chỉ test nút.

### P0: làm rõ quyền dùng thương mại và phạm vi phát hành

- Quyết định Lens: quyền thương mại có văn bản hoặc bỏ/thay thành phần, không chỉ giấu nút. Soát license/NOTICE của model và phông đi kèm.
- Đóng các gate còn mở cho tính năng đã quảng cáo: Split layer dialog, license SAM và Windows thật; không ghi sidecar chưa làm vì đã ship.
- Ký số/notarization là hạng mục phân phối có chi phí, chỉ thực hiện giao dịch khi owner xác nhận. Trong lúc chưa ký giữ hướng dẫn cài trung thực, không gọi đây là đã an toàn nhờ bỏ cảnh báo.
- Auto-update sau thiết kế ký số, có phát hiện bản cập nhật và đường nâng cấp thủ công trước nếu phù hợp. Không bỏ xác minh nguồn/checksum.

Gate: ma trận thành phần/giấy phép và artifact đóng gói; kiểm trên nền tảng được tuyên bố. Không biến khoản chi chưa duyệt thành việc agent tự làm.

### P1: bảo toàn ảnh sản phẩm bằng ghép lớp, không chỉ bằng prompt

Đề xuất một đường thiết kế có kiểm soát:

1. Ảnh sản phẩm gốc hoặc cutout do người dùng duyệt là tài sản riêng.
2. AI chỉ tạo nền/bối cảnh khi được yêu cầu; cũng có đường nền/mẫu sẵn.
3. Ghép ảnh sản phẩm làm layer không bị lệnh sửa nền tự thay src hay biến thành ảnh repaint.
4. Giá, ưu đãi, tên và logo cần chính xác là đối tượng riêng.
5. Sửa ảnh sản phẩm bằng AI là hành động tường minh, có preview và chi phí, không đi ké lệnh đổi nền.

Không hứa bảo toàn diện mạo tuyệt đối: co giãn, nội suy, nén và che khuất vẫn làm pixel xuất khác. Invariant kiểm được là asset nguồn không đổi, không méo tỷ lệ, không bị crop/che ngoài lựa chọn đã duyệt. Không tuyên bố màu bán hàng chính xác chỉ vì giữ cùng file.

Tái dùng layer lock, provenance, preview/apply và store sẵn có; cần policy nghiệp vụ ở service chứ không chỉ khóa canvas. Không ép mọi sản phẩm đi qua SAM tải lớn hoặc rembg chưa có.

Gate: ba ảnh thật có nhãn/logo/chi tiết nhỏ, kiểm hash asset và scene trước/sau đổi nền/giá, lỗi/cancel vẫn giữ sản phẩm, bản xuất so bằng mắt. Một lượt nền thật qua provider để xác nhận tích hợp, không chỉ mock.

Phản biện: ảnh ghép có thể lệch ánh sáng/phối cảnh và xấu hơn repaint. Cho chọn mẫu và vị trí phù hợp, không nhận mọi góc chụp; giữ đường repaint tường minh cho ai chấp nhận thay đổi.

### P1: biến thể lô nhỏ trước CSV lớn

Bắt đầu bằng harness nội bộ dùng scene/mẫu và engine xuất thật để kiểm ánh xạ trường, tràn chữ và chi phí bộ nhớ, không phải PoC UI hay tính năng đã ship. Nếu các ràng buộc đạt mới triển khai bảng nhập lô nhỏ trong app theo slice được duyệt. Không dựng ngay hệ nhập 700 SKU, nhiều định dạng bảng tính hoặc liên kết sàn. Không chặn bước này vì chưa có khảo sát, cũng không lấy việc chưa có API export làm lý do lén mở API mới.

- Trường gắn vào ID ổn định của layer, không suy theo tên layer hoặc vị trí mảng.
- Phân biệt trường nội dung với style và vùng ảnh; mỗi biến thể giữ dữ liệu riêng.
- Preview tất cả trước khi xuất, ghi rõ dòng nào tràn chữ/thiếu ảnh/thiếu giá; không tự bịa hoặc tự cắt chữ.
- V1 không tự co chữ đến mức không đọc được. Ngưỡng cỡ tối thiểu theo mẫu, vượt thì chặn riêng dòng và yêu cầu sửa.
- Không LLM cho nhân biến thể nội dung. Không tự rerun generation khi resume.
- Lưu checkpoint và manifest đầu ra; tên file có ID ổn định, xử lý trùng tên và ký tự Windows, giữ nguyên thứ tự qua retry.
- Giới hạn lô v1 cần benchmark bộ nhớ trước khi chốt. Bảng 5-20 dòng chỉ là phạm vi ứng viên, không phải cam kết hiệu năng hay bằng chứng nhu cầu.

Gate: đầu vào có tiếng Việt, giá 0, ô trống, tên dài, ảnh lỗi, SKU trùng, hủy giữa lô, restart, tên file đặc biệt. Kết quả thành công/thất bại từng dòng đúng, không xuất nhầm ảnh/giá. Không đổi preview so với file xuất. 0 lượt AI cho lô từ mẫu có sẵn. Bộ dữ liệu thật không cần tuyển người khảo sát.

Phản biện: Canva và công cụ đóng khung đã làm hàng loạt. Oia phải hơn ở ít bước, kiểm thông tin, đầu ra ổn định và chất lượng mẫu; CSV một mình không phải lợi thế. Nếu người dùng chỉ cần ghép khung miễn phí trên web, không ép chuyển sang Oia.

### P2: ba bố cục theo kích thước, không nút resize thần kỳ

Tạo biến thể bố cục cho bộ kích thước xác định bằng anchor/vùng tên/giá/sản phẩm trong mẫu. Lưu bản gốc, xem trước từng bản. Với mẫu chưa có layout tương ứng, báo chưa hỗ trợ hoặc cần căn thủ công; không cắt chữ rồi báo thành công.

Chốt bộ kích thước theo nguồn chính thức ở thời điểm triển khai, không bê tỷ lệ từ blog đối thủ. Không đồng nhất TikTok video 9:16 với mọi ảnh listing TikTok Shop.

Gate: cùng dữ liệu tiếng Việt dài trên ba layout được hỗ trợ; không méo/cắt sản phẩm, không tràn chữ, xuất đúng kích thước. Giữ undo và bản gốc.

### P2: chiến dịch dùng lại và xuất có hợp đồng

Lưu bản mẫu đã duyệt, biến thể và revision, không sửa chiến dịch tuần trước tại chỗ khi tạo tuần mới. Manifest ghi template version, dữ liệu đầu vào và kết quả từng tệp. Áp style chung có preview/diff, không ghi đè ngoại lệ riêng mà không báo.

V1 chỉ làm tệp local. Không tự đăng lên sàn, xử lý thông tin đăng nhập sàn, hẹn giờ khuyến mãi hay đồng bộ đơn hàng. Những việc đó đổi phạm vi rủi ro và cần quyết định khác.

## Những việc tạm gác

- Share/collaboration và gallery cộng đồng: chưa mở, không dựng backend chỉ vì đối thủ có.
- Draw và bảng đầy đủ: không đứng trước đường làm hình bán hàng cốt lõi; bug gây mất dữ liệu vẫn phải sửa.
- Nhận dạng mọi phông hoặc tái tạo pixel tuyệt đối từ poster bất kỳ: không làm mũi nhọn trước khi có bộ đo đa ảnh; D22 tiếp tục là lối hỗ trợ có giới hạn.
- Thêm hàng chục provider: trước hết giải quyết đường mẫu offline và trạng thái provider đang có. BYOK API-key trong UI từng bị owner rút (D18), không tự khôi phục.
- Rút installer bằng mọi giá: đo kích thước từng thành phần và cold start trước; không đổi D12 binary pin để tiết kiệm MB mà tạo lại lỗi tương thích.
- Web/mobile: không tự mở lại D1. Persona chủ yếu điện thoại là phản chứng về lựa chọn nhóm khách, không phải lý do tự tạo app thứ hai.

## Detailed Implementation Plan

> Cập nhật 13/11/2026 (vòng rà soát): từ ngày này, [execution-plan.md](execution-plan.md) là NGUỒN THỰC THI DUY NHẤT (bảng W0-W4 + rãnh P). Bảng slice dưới đây giữ nguyên vai trò lý lẽ/khung điều kiện dừng; xung đột thứ tự thì theo execution-plan.

Đây là thứ tự slice để lập kế hoạch sau khi owner duyệt hướng, không phải lệnh triển khai tự động.

| Slice | Đầu ra | Tái dùng | Gate bắt buộc |
| --- | --- | --- | --- |
| S0 | Ma trận trạng thái/giấy phép, benchmark luồng mẫu profile mới | Sổ D, registry, tài nguyên đóng gói | Không claim DONE cho gate chưa chạy; không chi tiền |
| S1 | Đường mẫu không provider rõ ràng, sửa/xuất không bị chặn | Home/Workspace, templates, Editor/export | Shot + packaged smoke + ảnh thật trên profile mới |
| S2 | Vai trò tài sản sản phẩm và invariant đổi nền/giá | schema, provenance, services, preview/apply | Chống ghi đè, cancel, load/save, 1 lượt provider thật |
| S3 | Trường mẫu + biến thể lô nhỏ + manifest | schema, tasks, pages, export | Dữ liệu xấu, tràn chữ, restart/cancel, đo RAM, 0 AI |
| S4 | Bộ ba layout được định nghĩa cho mẫu chọn lọc | presets, canvas, template catalog | Pixel/geometry + xem mắt + nền tảng thật |
| S5 | Revision chiến dịch và style chung có ngoại lệ | project store, migrations, atomic writes | Mở lại sau crash, bản cũ không đổi, xuất ổn định |

Không đưa ngày hoàn thành giả trước khi đo phạm vi. S3 chỉ mở sau khi S1/S2 chứng minh luồng đơn đáng tin; S4 không bắt buộc chờ S5. Ký số/giấy phép là nhánh song song cần owner quyết, không gộp thành hứa hẹn tính năng.

## Thước đo và điều kiện dừng

- Thời gian từ mở mẫu đến bộ xuất hợp lệ, số thao tác thủ công còn lại và số dòng phải sửa.
- Lỗi nghiêm trọng: nhầm sản phẩm, nhầm giá, mất dấu, mất file, ghi đè chiến dịch cũ, lặp lượt AI trả phí.
- Bộ benchmark có ảnh thật và dữ liệu tiếng Việt đa độ dài; so trước/sau trên cùng bộ, lưu artifact và thời gian. Không gọi đây là đo tỷ lệ giữ chân hay nhu cầu thị trường.
- Nếu lô tự động vẫn phải chỉnh gần hết từng trang, giảm scope mẫu hỗ trợ hoặc sửa layout, không tăng giới hạn lô để che vấn đề.
- Nếu ghép lớp giữ sản phẩm nhưng nhìn không dùng được, sửa cách chọn mẫu/ảnh và bố cục trước; không tự chuyển sang repaint rồi tuyên bố đã bảo toàn.
- Nếu không có đủ căn cứ cho một ngách, ghi bất định và tiếp tục nghiên cứu nguồn sẵn có; không đưa khảo sát thành điều kiện chặn.

## Kết quả hai vòng Goldfish

Vòng một nhập vai ba nhóm và tìm lý do từ chối; vòng hai đọc nguồn R1-R5/V1 để phản biện hướng đề xuất trong ngữ cảnh mới. Hai vòng cùng chọn S0/S1 trước, chưa làm batch generative hoặc CSV lớn. Không lấy đồng thuận mô hình làm chứng cứ người dùng.

Các ý bị bác khi tổng hợp: script batch gần như miễn phí qua API chưa có project/export; crop thành nhiều size rồi gọi an toàn; lấy SG cũ làm mô tả đủ của D22 hiện tại; yêu cầu CTR/retention thật làm điều kiện; khẳng định mọi nguồn thu đều bị Lens chặn hoặc ngược lại chỉ cần không gọi Lens là được phân phối thương mại. Xem disposition riêng tư để phân biệt kết quả reviewer với kết luận đã kiểm.

**Đề xuất hành động tiếp theo:** chỉ S0 và đường S1 bằng năng lực hiện có, đo trên profile mới với dữ liệu thật trước, sửa đúng ma sát được tái hiện. Chưa mở S2-S5 chỉ vì chúng xuất hiện trong roadmap. Đây là đề xuất để owner duyệt, không đổi mặc định sản phẩm.

## Xác minh của vòng tài liệu

Chỉ đọc mã và nghiên cứu nguồn. Chưa chạy benchmark sản phẩm, chưa chạy provider, chưa kiểm app đối thủ bằng GUI. Gates dự kiến không phải gates đã đạt. `git diff --check` là kiểm tra cho thay đổi tài liệu, không chứng minh đề xuất đã được triển khai.
