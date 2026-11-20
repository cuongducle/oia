import type { APIRoute } from 'astro'
import { useCases, USE_CASE_SLUGS, type UseCaseKey } from '../../data/usecases'
import { SITE, unescapeEntities } from '../../data/site-overview'

// /use-cases/[slug].md: markdown mirror of the use-case pages (GEO dogfood G3).
export function getStaticPaths() {
  return Object.entries(USE_CASE_SLUGS).map(([key, slug]) => ({ params: { slug } }))
}

function toMd(locale: 'en' | 'vi', key: UseCaseKey, slug: string): string {
  const meta = useCases(locale)[key]
  const vi = locale === 'vi'
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
    '## FAQ',
    '',
    ...meta.faq.map(([q, a]) => `### ${clean(q)}\n\n${clean(a)}\n`),
    vi ? `Trang HTML: ${SITE}/vi/use-cases/${slug}/` : `HTML page: ${SITE}/use-cases/${slug}/`,
    '',
  ]
  return lines.join('\n')
}

export const GET: APIRoute = ({ params }) => {
  const key = (Object.entries(USE_CASE_SLUGS) as [UseCaseKey, string][]).find(([, slug]) => slug === params.slug)?.[0]
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(toMd('en', key, params.slug!), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
