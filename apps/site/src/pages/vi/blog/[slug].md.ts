import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

// /vi/blog/[slug].md: bản markdown tiếng Việt của bài viết (GEO dogfood G3).
export async function getStaticPaths() {
  const posts = await getCollection('blog-vi')
  return posts.map((post) => ({ params: { slug: post.id }, props: { body: post.body ?? '' } }))
}

export const GET: APIRoute = ({ props }) =>
  new Response(props.body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
