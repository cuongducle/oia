import type { APIRoute } from 'astro'
import { landingFaq } from '../data/landing-faq'
import { overviewMarkdown, SITE } from '../data/site-overview'

// /index.md: clean-markdown mirror of the home page for AI engines
// (GEO dogfood G3). Served as text/markdown, linked from /llms.txt.
export const GET: APIRoute = () => {
  const faq = landingFaq('en')
  const md = [
    overviewMarkdown('en'),
    '\n## FAQ\n',
    ...faq.map((item) => `### ${item.question}\n\n${item.answer}\n`),
    '\n## Markdown mirrors\n',
    `- Vietnamese overview: ${SITE}/vi/index.md`,
    `- Flash-sale banners: ${SITE}/use-cases/flash-sale-banners.md`,
    `- Livestream overlays: ${SITE}/use-cases/livestream-overlays.md`,
    `- Presentations: ${SITE}/use-cases/presentations.md`,
    `- Blog posts (markdown): see /llms.txt for the full list`,
    '',
  ].join('\n')
  return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
