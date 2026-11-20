// Core facts for the markdown endpoints (GEO dogfood G3): one place for the
// numbers AI engines should read about Oia. Keep in sync with the landing
// page copy; when the app version changes, update it here too.

export const OIA_VERSION = '0.8.0'
export const REPO = 'https://github.com/cuongducle/oia'
export const SITE = 'https://oia.solutions'

export function overviewMarkdown(locale: 'en' | 'vi'): string {
  const vi = locale === 'vi'
  if (vi) {
    return `# Oia: tự làm banner Shopee, Lazada và TikTok Shop

Oia là ứng dụng desktop miễn phí, mã nguồn mở (MIT) giúp người bán trên Shopee, Lazada và TikTok Shop tự làm banner sale, khung livestream và slide thuyết trình từ ảnh sản phẩm của mình. Phiên bản ${OIA_VERSION} đi kèm 35 mẫu thật sửa chữ được; tạo ảnh AI dùng hạn mức gói ChatGPT của bạn, không cần API key.

## Sự thật chính

- Giá: ứng dụng miễn phí, không cần tài khoản Oia; tạo ảnh AI dùng hạn mức gói ChatGPT của chính bạn, ứng dụng báo ước lượng trước khi chạy.
- Nền tảng: macOS (Apple Silicon, M1 trở lên) và Windows 10/11 64-bit.
- Giấy phép: mã ứng dụng MIT; bộ nhận diện phông Lens đi kèm giới hạn phi thương mại.
- Kích thước sẵn: Shopee 1:1 (1024), Lazada 1:1 (800), TikTok Shop 1:1 (1080), tin ngắn 9:16, poster, thuyết trình, ảnh bìa YouTube, A4.
- Xuất file: PNG, JPG, PDF, PPTX, ZIP; khung livestream xuất PNG trong suốt 1080×1920.
- Riêng tư: dự án và ảnh lưu trên máy bạn; yêu cầu AI gửi tới nhà cung cấp của bạn.
- Mã nguồn: ${REPO}

## Trang chính

- Trang chủ: ${SITE}/vi/
- Thư viện 35 mẫu: ${SITE}/vi/templates/
- Gợi ý mô tả (prompt): ${SITE}/vi/prompts/
- Hướng dẫn cài: ${SITE}/vi/install/
- Tình huống dùng: banner flash sale ${SITE}/vi/use-cases/flash-sale-banners/ · khung livestream ${SITE}/vi/use-cases/livestream-overlays/ · slide thuyết trình ${SITE}/vi/use-cases/presentations/

(Cập nhật tháng 11/2026, ứng dụng ${OIA_VERSION}.)`
  }
  return `# Oia: sale banners for Shopee, Lazada and TikTok Shop

Oia is a free, open-source (MIT) desktop app that helps marketplace sellers make sale banners, livestream overlays and presentation decks from their own product photo. Version ${OIA_VERSION} ships with 35 real, text-editable templates; AI image generation uses your own ChatGPT plan, no API key required.

## Key facts

- Price: the app is free, no Oia account; AI generation uses your own ChatGPT plan allowance, with an estimate shown before each run.
- Platforms: macOS (Apple Silicon, M1 and newer) and Windows 10/11 64-bit.
- License: app code is MIT; the bundled Lens font recognizer carries a non-commercial restriction.
- Built-in sizes: Shopee 1:1 (1024), Lazada 1:1 (800), TikTok Shop 1:1 (1080), 9:16 stories, posters, presentations, YouTube thumbnails, A4.
- Exports: PNG, JPG, PDF, PPTX, ZIP; livestream overlays export as transparent 1080×1920 PNG.
- Privacy: projects and images stay on your machine; AI requests go to your provider.
- Source code: ${REPO}

## Main pages

- Home: ${SITE}/
- 35 bundled templates: ${SITE}/templates/
- Prompt library: ${SITE}/prompts/
- Install guide: ${SITE}/install/
- Use cases: flash-sale banners ${SITE}/use-cases/flash-sale-banners/ · livestream overlays ${SITE}/use-cases/livestream-overlays/ · presentations ${SITE}/use-cases/presentations/

(Updated November 2026, app ${OIA_VERSION}.)`
}

export function unescapeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '')
}
