import type { APIRoute } from 'astro'
import { landingFaq } from '../../data/landing-faq'
import { overviewMarkdown, SITE } from '../../data/site-overview'

// /vi/index.md: bản markdown tiếng Việt của trang chủ (GEO dogfood G3).
export const GET: APIRoute = () => {
  const faq = landingFaq('vi')
  const md = [
    overviewMarkdown('vi'),
    '\n## Câu hỏi thường gặp\n',
    ...faq.map((item) => `### ${item.question}\n\n${item.answer}\n`),
    '\n## Bản markdown khác\n',
    `- Bản tiếng Anh: ${SITE}/index.md`,
    `- Banner flash sale: ${SITE}/vi/use-cases/flash-sale-banners.md`,
    `- Khung livestream: ${SITE}/vi/use-cases/livestream-overlays.md`,
    `- Slide thuyết trình: ${SITE}/vi/use-cases/presentations.md`,
    '',
  ].join('\n')
  return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
