import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// One Markdown file per post. The slug in the URL is the filename. Every new
// post must also be added to public/sitemap.xml; config/audit/site-links.py
// fails the build when the two drift apart. blog is English, blog-vi is the
// Vietnamese mirror under /vi/blog/ with the same slugs.
const post = z.object({ title: z.string(), description: z.string(), pubDate: z.coerce.date() })
const blog = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog' }), schema: post })
const blogVi = defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog-vi' }), schema: post })

export const collections = { blog, 'blog-vi': blogVi }
