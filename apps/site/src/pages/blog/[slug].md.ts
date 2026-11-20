import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'

// /blog/[slug].md: the post's own markdown, served verbatim (GEO dogfood G3).
export async function getStaticPaths() {
  const posts = await getCollection('blog')
  return posts.map((post) => ({ params: { slug: post.id }, props: { body: post.body ?? '' } }))
}

export const GET: APIRoute = ({ props }) =>
  new Response(props.body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
