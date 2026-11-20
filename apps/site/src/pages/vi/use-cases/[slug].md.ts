import type { APIRoute } from 'astro'
import { useCases, USE_CASE_SLUGS, type UseCaseKey } from '../../../data/usecases'
import { SITE, unescapeEntities } from '../../../data/site-overview'

// /vi/use-cases/[slug].md: bản markdown tiếng Việt (GEO dogfood G3).
export function getStaticPaths() {
  return Object.entries(USE_CASE_SLUGS).map(([key, slug]) => ({ params: { slug } }))
}

function toMd(key: UseCaseKey, slug: string): string {
  const meta = useCases('vi')[key]
  const clean = (s: string) => unescapeEntities(s)
  const lines = [
    `# ${clean(meta.title.replace(' | Oia', ''))}`,
    '',
    clean(meta.lede),
    '',
    `## ${clean(meta.stepsTitle)}`,
    '',
    ...meta.steps.map(([n, h, p]) => `- **${n} · ${clean(h)}**: ${clean(p)}`),
    '',
    `## ${clean(meta.factsTitle)}`,
    '',
    ...meta.facts.map((f) => `- ${clean(f)}`),
    '',
    '## Câu hỏi thường gặp',
    '',
    ...meta.faq.map(([q, a]) => `### ${clean(q)}\n\n${clean(a)}\n`),
    `Trang HTML: ${SITE}/vi/use-cases/${slug}/`,
    '',
  ]
  return lines.join('\n')
}

export const GET: APIRoute = ({ params }) => {
  const key = (Object.entries(USE_CASE_SLUGS) as [UseCaseKey, string][]).find(([, slug]) => slug === params.slug)?.[0]
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(toMd(key, params.slug!), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
