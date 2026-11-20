import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { landingFaq } from '../data/landing-faq'
import { useCases, USE_CASE_SLUGS, type UseCaseKey } from '../data/usecases'
import { overviewMarkdown, SITE, OIA_VERSION, REPO, unescapeEntities } from '../data/site-overview'

// /llms-full.txt (GEO dogfood G1): the whole site's key content in one plain
// text file, generated at build time from the same data modules as the HTML,
// so it can never drift from the pages.
function useCaseMd(key: UseCaseKey): string {
  const slug = USE_CASE_SLUGS[key]
  const meta = useCases('en')[key]
  const clean = (s: string) => unescapeEntities(s)
  return [
    `# ${clean(meta.title.replace(' | Oia', ''))}`,
    '',
    clean(meta.lede),
    '',
    ...meta.steps.map(([n, h, p]) => `- ${n} · ${clean(h)}: ${clean(p)}`),
    '',
    ...meta.faq.map(([q, a]) => `Q: ${clean(q)}\nA: ${clean(a)}`),
    '',
    `Page: ${SITE}/use-cases/${slug}/`,
    '',
  ].join('\n')
}

export async function GET() {
  const [postsEn, postsVi] = await Promise.all([getCollection('blog'), getCollection('blog-vi')])
  const faqEn = landingFaq('en')
  const faqVi = landingFaq('vi')
  const parts: string[] = [
    `# Oia, full site content`,
    ``,
    `> Free, open-source desktop app (macOS & Windows) that makes sale banners, livestream overlays and presentation decks for Shopee, Lazada and TikTok Shop sellers. 35 editable templates included; AI image generation uses your own ChatGPT plan. Facts as of November 2026, app version ${OIA_VERSION}. Vietnamese version below.`,
    ``,
    `Repo: ${REPO}`,
    `Site: ${SITE}/`,
    ``,
    `====================`,
    `## ENGLISH OVERVIEW`,
    `====================`,
    ``,
    overviewMarkdown('en'),
    ``,
    `## ENGLISH FAQ (home page)`,
    ``,
    ...faqEn.map((f) => `Q: ${f.question}\nA: ${f.answer}\n`),
    `## USE CASES (ENGLISH)`,
    ``,
    ...((Object.keys(USE_CASE_SLUGS) as UseCaseKey[]).map(useCaseMd)),
    `## BLOG POSTS (ENGLISH MARKDOWN)`,
    ``,
    ...postsEn.map((p) => `# ${p.data.title}\n(${SITE}/blog/${p.id}/)\n\n${p.body}\n`),
    `====================`,
    `## TỔNG QUAN TIẾNG VIỆT`,
    `====================`,
    ``,
    overviewMarkdown('vi'),
    ``,
    `## CÂU HỎI THƯỜNG GẶP (TRANG CHỦ)`,
    ``,
    ...faqVi.map((f) => `H: ${f.question}\nĐ: ${f.answer}\n`),
    `## BÀI VIẾT (MARKDOWN TIẾNG VIỆT)`,
    ``,
    ...postsVi.map((p) => `# ${p.data.title}\n(${SITE}/vi/blog/${p.id}/)\n\n${p.body}\n`),
  ]
  return new Response(parts.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
