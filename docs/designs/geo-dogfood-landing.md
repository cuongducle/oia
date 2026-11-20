# GEO dogfood cho landing site (20/11/2026)

Quyết định và lý do cho các thay đổi GEO/AEO trên `apps/site`. Nguồn nghiên cứu và phương pháp đo nằm ở DualLens: `dual-lens/docs/research/2026-11-20-oia-geo-dogfood.md`. Nguyên tắc: site của một công cụ đo GEO phải làm gương (cùng quy tắc đã áp cho DualLens site, ADR-0010).

## Bối cảnh

Audit DualLens (`duallens audit --origin https://oia.solutions`, 20/11) cho thấy baseline: robots đơn giản (không khai báo Sitemap), không có llms.txt/llms-full.txt, và FAQPage JSON-LD bị tiêm bằng JS client-side (`public/faq-schema.js`) nên các crawler AI không chạy JS sẽ không bao giờ thấy. Đó là các gap cần đóng trước khi đo lại.

## Các quyết định (G1-G6)

- **G1. llms.txt + llms-full.txt.** `public/llms.txt` là index tĩnh theo chuẩn llmstxt.org; `/llms-full.txt` được sinh lúc build bởi `src/pages/llms-full.txt.ts` từ cùng các data module với HTML nên không thể lệch nội dung.
- **G2. FAQPage JSON-LD build-time.** Xóa `public/faq-schema.js` (tiêm schema bằng JS sau khi load). Schema giờ render từ chính data FAQ: home (`Landing.astro` dùng `src/data/landing-faq.ts`), use-cases (`UseCasePages.astro`), templates (`TemplateFaq.astro`). Lý do: GPTBot/ClaudeBot/PerplexityBot không thực thi JS.
- **G3. Markdown mirror endpoints.** `/index.md`, `/vi/index.md`, `/use-cases/[slug].md`, `/vi/use-cases/[slug].md`, `/blog/[slug].md`, `/vi/blog/[slug].md` phục `text/markdown`. Blog xuất nguyên markdown gốc của bài. Single source: `src/data/site-overview.ts` (facts), `src/data/landing-faq.ts` (FAQ), `src/data/usecases.ts` (use-case content). Khi bump version app, cập nhật `OIA_VERSION` trong `site-overview.ts`.
- **G4. Tách data module dùng chung.** `src/data/landing-faq.ts` và `src/data/usecases.ts` (tách từ `Landing.astro`, `UseCasePages.astro`) để HTML, JSON-LD và .md không trùng lặp chuỗi.
- **G5. robots.txt nêu đích danh 13 bot AI + `Sitemap:` tuyệt đối.** Về kỹ thuật `User-agent: * Allow: /` đã cho phép tất cả; nêu đích danh để minh bạch và để audit DualLens nhận ra sitemap qua robots.
- **G6. sitemap.xml thêm `lastmod`** (ngày phát hành 20/11/2026) cho cả 48 URL.
- **G7 (sửa lỗi có sẵn).** JSON-LD của BlogPosting/FAQPage từng render sau `</html>` vì `slot="head"` đặt ngoài thẻ component. Layout `Page.astro` nhận prop `jsonLd` và render trong `<head>` qua BaseHead. Kiểm tra build: không còn JSON-LD nào sau `</html>`; templates pages có schema trong `<body>` (hợp lệ với schema.org/Google).

## Verify

- `pnpm --filter @oia/site build` + `python3 config/audit/site-links.py` → SITE LINKS OK (parity hai chiều giữ nguyên).
- Diff dist trước/sau: mọi thay đổi HTML chỉ là thêm JSON-LD; không đổi nội dung hiển thị.
- `pnpm --filter @oia/site typecheck` sạch.
- Preview: `.md` endpoints trả `text/markdown`, `llms*.txt` trả `text/plain`.

## Đo lường dogfood (DualLens)

- Baseline đo NGAY TRƯỚC deploy: run `run-dogfood-oia-2026-11-20` (panel `oia-banner-maker`, 10 câu screening x 2 engine browser consumer ChatGPT/Gemini, 0 đồng theo ADR-0007 DualLens).
- Sau deploy + thời gian re-crawl: tái đo cùng panel, so sánh bằng export DualLens. "Cái gì work" được kết luận bằng số, không bằng cảm tính.
- Kỳ vọng trung thực: llms.txt/robots/sitemap/md endpoints tăng khả năng BỊ ĐỌC (crawlability, index); mention của Oia phụ thuộc thêm vào tín hiệu ngoài site (độ mới của domain, backlink, lượng người dùng thật), không thể hẹn ngày.

## Còn nợ

- Deploy (wrangler, account id trong docs/private/landing-deploy.md) + zone cache purge nếu HTML cũ dính edge cache.
- .md mirror cho `/templates/`, `/prompts/`, `/install/` (chưa làm, ưu tiên thấp).
- HowTo schema cho các bài blog dạng bước (chưa làm).
- Không thêm .md vào sitemap.xml (sitemap là cho HTML; liệt kê trong llms.txt là đủ).
