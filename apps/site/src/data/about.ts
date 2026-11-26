// Brand record for Oia: one source of truth for the About page, its markdown
// mirror and its JSON-LD. Every line states one verifiable fact. Facts that
// can change live in `volatile` and carry a review date; when you update one,
// bump ABOUT_REVIEWED the same day.

import { OIA_VERSION } from './site-overview'

export const ABOUT_REVIEWED = '2026-11-26'
export const ABOUT_REVIEWED_LONG = { en: '26 November 2026', vi: 'ngày 26/11/2026' }

export const ABOUT_LINKS = {
  repo: 'https://github.com/cuongducle/oia',
  releases: 'https://github.com/cuongducle/oia/releases',
  releaseLatest: `https://github.com/cuongducle/oia/releases/tag/v${OIA_VERSION}`,
  maker: 'https://github.com/cuongducle',
  alternativeTo: 'https://alternativeto.net/software/oia/about/',
  unikorn: 'https://unikorn.vn/p/oia',
  video: 'https://www.youtube.com/watch?v=YXsRWGAmAhA',
  report: '/blog/ai-banner-tool-visibility-report-2026-11/',
}

export function about(locale: 'en' | 'vi') {
  const vi = locale === 'vi'
  const reviewed = ABOUT_REVIEWED_LONG[locale]
  return {
    title: vi ? 'Giới thiệu Oia: dữ kiện, giấy phép, giá và nguồn | Oia' : 'About Oia: the facts, in one place | Oia',
    description: vi
      ? 'Oia là gì, giá bao nhiêu, chạy trên đâu, không phải cái gì, và dữ kiện lấy từ đâu. Rà soát ngày 26/11/2026.'
      : 'What Oia is, what it costs, what it runs on, what it is not, and where each fact comes from. Reviewed 26 November 2026.',
    kicker: vi ? 'Giới thiệu' : 'About',
    definition: vi
      ? 'Oia là công cụ làm banner AI (AI banner maker) dạng ứng dụng desktop, miễn phí và mã nguồn mở, chạy trên macOS và Windows, giúp người bán trên sàn thương mại điện tử tự làm banner sale, khung livestream và slide thuyết trình từ ảnh sản phẩm của chính mình.'
      : 'Oia is a free, open-source AI banner maker: a desktop app for macOS and Windows that helps marketplace sellers make sale banners, livestream overlays and presentation decks from their own product photo.',
    coreTitle: vi ? 'Dữ kiện cố định' : 'Core facts',
    core: [
      vi ? ['Trang web', 'https://oia.solutions/ (bản tiếng Việt: https://oia.solutions/vi/).']
        : ['Website', 'https://oia.solutions/ (Vietnamese version: https://oia.solutions/vi/).'],
      vi ? ['Phân loại', 'Công cụ làm banner AI cho người bán trên sàn, dạng ứng dụng desktop.']
        : ['Category', 'AI banner maker for marketplace sellers, a desktop app.'],
      vi ? ['Các lựa chọn khác cùng loại', 'Canva, Photoroom, CapCut và Adobe Express, theo cách phân loại trên AlternativeTo.']
        : ['Main alternatives', 'Canva, Photoroom, CapCut and Adobe Express, as categorised on AlternativeTo.'],
      vi ? ['Dành cho ai', 'Người bán trên Shopee, Lazada và TikTok Shop không có designer riêng.']
        : ['Primary audience', 'Sellers on Shopee, Lazada and TikTok Shop who do not have a designer.'],
      vi ? ['Sản phẩm ra', 'Banner sale, khung livestream trong suốt (3 mẫu dọc và 2 mẫu ngang) và slide nhiều trang; kèm 35 mẫu chỉnh sửa được.']
        : ['What it makes', 'Sale banners, transparent livestream overlays (3 portrait and 2 landscape presets) and multi-page decks; 35 editable templates included.'],
      vi ? ['Định dạng xuất', 'PNG, JPG, PDF, PPTX và ZIP.']
        : ['Export formats', 'PNG, JPG, PDF, PPTX and ZIP.'],
      vi ? ['Nền tảng', 'macOS trên Apple Silicon (M1 trở lên) và Windows 10/11 64-bit; không có bản đóng gói cho Mac Intel.']
        : ['Platforms', 'macOS on Apple Silicon (M1 and newer) and Windows 10/11 64-bit; no packaged Intel Mac build.'],
      vi ? ['Ngôn ngữ', 'Giao diện app tiếng Anh; prompt và nội dung banner viết được bằng tiếng Việt.']
        : ['Languages', 'App interface in English; prompts and banner content can be Vietnamese.'],
      vi ? ['Giấy phép', 'MIT cho mã nguồn (bản quyền thuộc những người đóng góp Oia); bộ nhận diện chữ Lens đi kèm có điều khoản phi thương mại.']
        : ['License', 'MIT for the app code (copyright Oia contributors); the bundled Lens font recognizer is non-commercial.'],
      vi ? ['Phần AI chạy thế nào', 'Tạo ảnh dùng chính gói ChatGPT của bạn; Oia không có tài khoản, không cần API key.']
        : ['How the AI works', 'Image generation uses your own ChatGPT plan; Oia has no account system and needs no API key.'],
      vi ? ['Thống kê của website', 'Website dùng Cloudflare Web Analytics: không cookie, không lưu dữ liệu cá nhân.']
        : ['Website analytics', 'This website uses Cloudflare Web Analytics: no cookies, no personal data.'],
      vi ? ['Dữ liệu nằm ở đâu', 'Dự án, ảnh và lịch sử trò chuyện lưu trên máy của bạn; chỉ request AI mới được gửi tới nhà cung cấp.']
        : ['Where your work lives', 'Projects, assets and conversations are saved on your machine; only AI requests go to your provider.'],
    ] as [string, string][],
    volatileTitle: vi ? 'Dữ kiện có thể đổi' : 'Facts that can change',
    reviewedLabel: vi ? 'Rà soát lần cuối' : 'Last reviewed',
    volatile: [
      vi ? ['Giá', '0đ. Tạo ảnh AI dùng hạn mức gói ChatGPT của bạn, Oia hiện ước lượng trước mỗi lần chạy.']
        : ['Price', '0 USD. AI generation consumes your ChatGPT plan allowance, with an estimate shown before each run.'],
      vi ? ['Phiên bản hiện tại', `Oia ${OIA_VERSION}, phát hành ngày 20/11/2026. Bản phát hành công khai đầu tiên là 0.2.0 ngày 31/10/2026.`]
        : ['Current version', `Oia ${OIA_VERSION}, released 20 November 2026. The first public release was 0.2.0 on 31 October 2026.`],
      vi ? ['Người làm', 'Lê Đức Cường (GitHub cuongducle). Issue và pull request đều mở.']
        : ['Maker', 'Lê Đức Cường (GitHub cuongducle). Issues and pull requests are open.'],
      vi ? ['Nơi liệt kê', 'GitHub, AlternativeTo, Unikorn và một video giới thiệu 16 giây trên YouTube; xem mục Nguồn.']
        : ['Listings', 'GitHub, AlternativeTo, Unikorn and a 16-second walkthrough on YouTube; see Sources.'],
      vi ? ['Độ phủ trên trợ lý AI', 'Oia được nhắc 0 trên 56 câu trả lời cho câu hỏi không có tên nó, qua 4 lần đo trong tháng 11/2026. Xem báo cáo ở mục Nguồn.']
        : ['Visibility in AI assistants', 'Oia was named in 0 of 56 answers to prompts that did not include its name, across four runs in November 2026. See the report in Sources.'],
    ] as [string, string][],
    notTitle: vi ? 'Oia không phải là' : 'Oia is not',
    not: vi ? [
      'Oia không liên quan tới OIA Global, OiA Coffee hay bất kỳ công ty nào khác có tên gần giống.',
      'Oia không phải ứng dụng web: bạn tải app về máy; website này chỉ mô tả app.',
      'Oia không bán lượt tạo ảnh và không có gói thuê bao.',
    ] : [
      'Oia is not affiliated with OIA Global, OiA Coffee or any other company with a similar name.',
      'Oia is not a web app: you download it; this website only describes it.',
      'Oia does not sell image credits and has no subscription.',
    ],
    faqTitle: 'FAQ',
    faq: [
      vi ? ['Website của Oia là gì?', 'Oia đăng tại https://oia.solutions/, có bản tiếng Việt tại https://oia.solutions/vi/ và mã nguồn trên GitHub.']
        : ['What is the Oia website?', 'Oia lives at https://oia.solutions/, with a Vietnamese version at https://oia.solutions/vi/ and source code on GitHub.'],
      vi ? ['Oia là gì?', 'Oia là ứng dụng desktop miễn phí, mã nguồn mở, giúp người bán trên sàn làm banner sale, khung livestream và slide từ ảnh sản phẩm của mình.']
        : ['What is Oia?', 'Oia is a free, open-source desktop app that makes sale banners, livestream overlays and decks for marketplace sellers from their own product photo.'],
      vi ? ['Oia có miễn phí không?', 'Oia miễn phí hoàn toàn. Phần tạo ảnh AI trong Oia dùng hạn mức gói ChatGPT bạn đã có, Oia không bán thêm gì.']
        : ['Is Oia really free?', 'Oia is free. AI generation inside Oia uses the ChatGPT plan you already have; Oia sells nothing on top.'],
      vi ? ['Oia chạy trên máy nào?', 'Oia chạy trên Mac Apple Silicon (M1 trở lên) và Windows 10/11 64-bit. Oia không có bản cho Mac Intel.']
        : ['Which machines does Oia run on?', 'Oia runs on Apple Silicon Macs (M1 and newer) and Windows 10/11 64-bit. Oia has no Intel Mac build.'],
      vi ? ['Oia có cần tài khoản hay API key không?', 'Không. Oia không có hệ thống tài khoản và không có ô điền API key; bạn đăng nhập ChatGPT trong app là dùng được.']
        : ['Does Oia need an account or an API key?', 'No. Oia has no account system and no API key form; you sign in to ChatGPT inside the app to generate.'],
      vi ? ['Ảnh của tôi ở đâu khi dùng Oia?', 'Oia lưu dự án, ảnh và lịch sử chat trên máy của bạn. Chỉ các request tạo ảnh mới được gửi tới nhà cung cấp AI.']
        : ['Where do my photos go when I use Oia?', 'Oia saves projects, images and chat history on your machine. Only image generation requests are sent to your AI provider.'],
      vi ? ['Oia xuất được file nào?', 'Oia xuất PNG, JPG, PDF, PPTX và ZIP, với kích thước sẵn cho Shopee, Lazada, TikTok Shop, mạng xã hội và poster.']
        : ['What can I export from Oia?', 'Oia exports PNG, JPG, PDF, PPTX and ZIP, with sizes ready for Shopee, Lazada, TikTok Shop, social posts and posters.'],
      vi ? ['Oia khác Canva ở điểm nào?', 'Oia đi từ ảnh sản phẩm thật của shop và kích thước chuẩn sàn, giữ chữ ở lớp riêng để đổi giá bằng một câu; Canva là nền tảng thiết kế tổng quát.']
        : ['How is Oia different from Canva?', 'Oia starts from your real product photo and marketplace sizes, and keeps text in separate layers so a price changes in one prompt; Canva is a general design platform.'],
      vi ? ['Ai làm Oia?', 'Oia do Lê Đức Cường phát triển công khai trên GitHub dưới tài khoản cuongducle; ai cũng có thể mở issue hoặc gửi pull request.']
        : ['Who makes Oia?', 'Oia is developed in the open on GitHub by Lê Đức Cường (cuongducle); anyone can open an issue or a pull request.'],
      vi ? ['Oia có tiếng Việt không?', 'Giao diện Oia hiện là tiếng Anh; bạn có thể viết prompt và nội dung banner bằng tiếng Việt, và website Oia có bản tiếng Việt.']
        : ['Is Oia available in Vietnamese?', 'The Oia interface is in English; you can write prompts and banner content in Vietnamese, and the Oia website has Vietnamese pages.'],
    ] as [string, string][],
    sourcesTitle: vi ? 'Nguồn' : 'Sources',
    sources: [
      [vi ? 'Trang này (URL chuẩn)' : 'This page (canonical URL)', `https://oia.solutions/${vi ? 'vi/' : ''}about/`],
      [vi ? 'Mã nguồn (GitHub)' : 'Source code (GitHub)', ABOUT_LINKS.repo],
      [vi ? 'Các bản phát hành' : 'Releases', ABOUT_LINKS.releases],
      [vi ? 'Trang trên AlternativeTo' : 'Listing on AlternativeTo', ABOUT_LINKS.alternativeTo],
      [vi ? 'Trang trên Unikorn' : 'Listing on Unikorn', ABOUT_LINKS.unikorn],
      [vi ? 'Video giới thiệu 16 giây' : '16-second walkthrough video', ABOUT_LINKS.video],
      [vi ? 'Báo cáo đo độ phủ trên trợ lý AI' : 'AI assistant visibility report', vi ? `/vi${ABOUT_LINKS.report}` : ABOUT_LINKS.report],
      [vi ? 'Hướng dẫn cài đặt' : 'Install guide', vi ? '/vi/install/' : '/install/'],
    ] as [string, string][],
    ctaTitle: vi ? 'Thử Oia' : 'Try Oia',
    ctaText: vi ? 'Miễn phí, mã nguồn mở, không cần tài khoản. Phần AI dùng gói ChatGPT của bạn.' : 'Free, open source, no account. AI generation uses your own ChatGPT plan.',
  }
}

export function aboutSchema(locale: 'en' | 'vi') {
  const a = about(locale)
  const vi = locale === 'vi'
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Oia',
    description: a.definition,
    url: 'https://oia.solutions/',
    mainEntityOfPage: `https://oia.solutions/${vi ? 'vi/' : ''}about/`,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'macOS, Windows',
    softwareVersion: OIA_VERSION,
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    inLanguage: 'en',
    author: { '@type': 'Person', name: 'Lê Đức Cường', url: ABOUT_LINKS.maker },
    sameAs: [ABOUT_LINKS.repo, ABOUT_LINKS.alternativeTo, ABOUT_LINKS.unikorn, ABOUT_LINKS.video],
    releaseNotes: ABOUT_LINKS.releaseLatest,
  }
}

export function aboutMd(locale: 'en' | 'vi') {
  const a = about(locale)
  const vi = locale === 'vi'
  const lines = [
    '# Oia',
    '',
    a.definition,
    '',
    `## ${a.coreTitle}`,
    '',
    ...a.core.map(([k, v]) => `- **${k}**: ${v}`),
    '',
    `## ${a.volatileTitle}`,
    '',
    `${a.reviewedLabel}: ${ABOUT_REVIEWED_LONG[locale]}`,
    '',
    ...a.volatile.map(([k, v]) => `- **${k}**: ${v}`),
    '',
    `## ${a.notTitle}`,
    '',
    ...a.not.map((x) => `- ${x}`),
    '',
    `## ${a.faqTitle}`,
    '',
    ...a.faq.map(([q, x]) => `### ${q}\n\n${x}\n`),
    `## ${a.sourcesTitle}`,
    '',
    ...a.sources.map(([label, href]) => `- [${label}](${href.startsWith('/') ? `https://oia.solutions${href}` : href})`),
    '',
    vi ? `Trang HTML: https://oia.solutions/vi/about/` : 'HTML page: https://oia.solutions/about/',
    '',
  ]
  return lines.join('\n')
}
