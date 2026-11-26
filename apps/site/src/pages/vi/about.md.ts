import type { APIRoute } from 'astro'
import { aboutMd } from '../../data/about'

// /vi/about.md: markdown mirror of the brand record page (GEO dogfood G3).
export const GET: APIRoute = () =>
  new Response(aboutMd('vi'), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
