# A/B prompt evidence — full prompts per round (2026-11-05)

Round 1 — no craft rules (A) vs IMAGE_CRAFT_RULES v1 (B), cùng user prompt, poster dọc 1360×2048:

```
# A/B — DA-11 image-craft rules

## User prompt
Làm banner quảng cáo trà sữa trân châu đường đen giảm 20% chỉ hôm nay, hình cô nhân viên trẻ tươi cười cầm ly trà sữa, phong cách hiện đại, để đăng Facebook

## A — old planner prompt
```
Tạo banner quảng cáo Facebook tỷ lệ dọc 0.66 (1360×2048), phong cách hiện đại với bố cục dựa trên lưới, khoảng trắng thoáng, thứ bậc thị giác rõ và căn chỉnh mô-đun. Hình cô nhân viên trẻ tươi cười, thân thiện, cầm ly trà sữa trân châu đường đen nổi bật; ánh sáng tươi sáng, màu nâu caramel và kem, cảm giác ngon miệng, chuyên nghiệp. Render nguyên văn toàn bộ chữ tiếng Việt: tiêu đề lớn, đậm ở phía trên “TRÀ SỮA TRÂN CHÂU ĐƯỜNG ĐEN”; huy hiệu giảm giá nổi bật “GIẢM 20%”; dòng phụ “CHỈ HÔM NAY”. Đặt mọi chữ và chi tiết quan trọng trong vùng an toàn, cách mỗi mép ít nhất 10% để không bị cắt khi crop.
```

## B — new planner prompt (with IMAGE_CRAFT_RULES)
```
Create a Facebook advertising banner in vertical 0.66 aspect ratio (1360×2048). Keep ALL text inside a safe area at least 10% clear of every edge. Modern grid-based layout with generous whitespace, strong focal hierarchy, and modular alignment. Feature a cheerful young female tea shop employee holding a clear cup of brown sugar bubble milk tea with visible tapioca pearls, medium shot at eye level; natural skin texture, a few stray hair strands, and realistic fabric weave on her uniform. Cup in sharp focus, softly detailed shop background. Dominant warm cream, secondary deep brown, 10% caramel accent. Single soft warm side-light from camera left, gentle shadows. Matte cream paper-like background with subtle printed texture; cup condensation and glossy tapioca pearls. Render these Vietnamese lines verbatim: “TRÀ SỮA TRÂN CHÂU ĐƯỜNG ĐEN” as a bold, clean headline near the top; “GIẢM 20%” oversized and high-impact below it; “CHỈ HÔM NAY” in a clear contrasting promotional badge. Keep all lettering crisp, correctly spelled, and legible.
```
```

Round 2 — rules v1 (A) vs v2 (+15th rules, orientation language + zone skeleton) — cặp dọc và cặp ngang:

```
# A/B round 2 — DA-11 v1 vs v2 (poster skeleton + orientation language)

## p1-portrait / a-v1 (rules v1)

```
Facebook ad poster for a Vietnamese bubble tea shop, aspect ratio 0.66 (1360×2048), composed for a cover crop. Keep every text line and key visual at least 10% clear of every edge. Audience: young people looking for a cheerful treat; the brand feels fresh, welcoming, and contemporary. Use a grid-based layout, generous whitespace, strong focal hierarchy, and modular alignment. Show a smiling young Vietnamese tea shop employee holding a clear cup of black sugar pearl milk tea, medium shot at eye level; natural skin texture, a few loose hair strands, and visible fabric weave in her uniform. Make the cup the main product focal point, with glossy black sugar streaks inside the cup and distinct tapioca pearls. Matte paper-like graphic surfaces with subtle brushed-metal accents. Palette: cream dominant, deep brown secondary, caramel accent. Soft warm side-light from camera left, gentle natural shadows; keep the woman and cup in sharp focus with the background softly receding. Render all copy exactly in Vietnamese: large bold headline “TRÀ SỮA TRÂN CHÂU ĐƯỜNG ĐEN” near the top; a prominent “GIẢM 20%” badge beneath it; “CHỈ HÔM NAY” in a clear supporting line. Keep typography legible and fully inside the safe area.
```

## p1-portrait / b-v2 (rules v2)

```
Vertical poster, portrait orientation, top-to-bottom layout. Ad poster for a modern Vietnamese bubble tea shop, aimed at young Facebook users, featuring a smiling young female shop employee holding a clear cup of brown sugar pearl milk tea as the primary visual. Use a modern grid-based composition with generous whitespace, strong focal hierarchy, and modular alignment. Top ~40% typography zone: render the exact Vietnamese copy “TRÀ SỮA TRÂN CHÂU ĐƯỜNG ĐEN” as a bold, friendly headline and “GIẢM 20% • CHỈ HÔM NAY” as a large offer line with a clear promotional badge. Middle ~45% subject stage: medium shot at eye level, employee in a warm neutral apron, cup prominent in her hand; arrange a few tapioca pearls and a small glass of brown sugar syrup around the hero, with a thin ribbon of steam-like warmth and caramel light connecting the stage to the offer above. Bottom ~15% support strip: render “NGỌT THƠM • TRÂN CHÂU DẺO” and “GHÉ MUA NGAY” in crisp, legible Vietnamese typography. Friendly, upbeat campaign energy; deep brown as the dominant color, cream secondary, caramel gold accent. Natural skin texture, subtle imperfections, stray hair strands, visible fabric weave. Clear cup with glossy tea, chewy dark pearls, syrup streaks; satin-finish paper cup sleeve and softly textured counter. Warm side-light from camera left makes the syrup glow and casts soft shadows across the counter; subject and cup in sharp focus, shop background gently receding. Keep every text line inside a safe area at least 10% clear of every edge, checked along the long axis first, so the portrait cover crop preserves all copy.
```

## p2-landscape / a-v1 (rules v1)

```
Ad poster banner ngang đăng Facebook, tỷ lệ khung hình 1920×1080 (1.78). Dành cho khách hàng yêu công nghệ, tạo cảm giác khai trương hiện đại, trẻ trung và đáng tin cậy. Bố cục theo lưới, khoảng trắng rộng, phân cấp thị giác rõ, căn chỉnh mô-đun; điện thoại thông minh làm điểm nhấn trên bệ kim loại xước mờ và mặt kính satin, cùng vài hình khối giao diện 3D tinh gọn. Bảng màu chủ đạo xanh điện, phụ trắng, điểm nhấn cam. Ánh sáng studio khuếch tán từ phía trên bên trái, bóng mềm; sản phẩm nét rõ, hậu cảnh có chiều sâu vừa phải. Render nguyên văn toàn bộ nội dung tiếng Việt sau, chữ không sai dấu: “KHAI TRƯƠNG” lớn, đậm ở phía trên; “CỬA HÀNG ĐIỆN THOẠI” ngay bên dưới; “GIẢM 15%” thật lớn ở trung tâm; “CUỐI TUẦN” trên nhãn khuyến mãi nổi bật. Giữ tất cả chữ và nội dung chính trong vùng an toàn, cách mỗi cạnh tối thiểu 10%, chừa lề thoáng để không bị cắt khi hiển thị.
```

## p2-landscape / b-v2 (rules v2)

```
Wide banner, landscape orientation, left-to-right flow. Ad poster for a Facebook post announcing a phone shop grand opening, aimed at local shoppers looking for a weekend deal; modern grid-based design with generous whitespace, strong focal hierarchy, and modular alignment. Anchor the left third with a close-up three-quarter view of a sleek smartphone standing on a matte stone surface, crisp screen reflections shaped by a warm side-light from camera left; place the promotional copy on the right with deliberate negative space around it. Use a deep navy dominant palette, clean white secondary, and electric blue accents. Render all Vietnamese copy exactly and legibly: bold headline “KHAI TRƯƠNG” at the upper right, large “GIẢM 15%” beneath it, and “CUỐI TUẦN” in a compact accent badge. Keep every text line inside a safe area at least 10% clear of every edge, with comfortable spacing for Facebook cropping.
```
```
