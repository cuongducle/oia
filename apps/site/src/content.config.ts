import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// One Markdown file per post under src/content/blog/. The slug in the URL is
// the filename. Every new post must also be added to public/sitemap.xml;
// config/audit/site-links.py fails the build when the two drift apart.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
  }),
})

export const collections = { blog }
