import type { APIRoute } from 'astro';
import { publicUrl, robotsTxt } from '../lib/seo/meta.ts';

export const GET: APIRoute = ({ site }) =>
  new Response(
    robotsTxt(publicUrl(site!.origin, import.meta.env.BASE_URL, 'sitemap.xml')),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
