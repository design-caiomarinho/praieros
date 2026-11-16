import type { APIRoute } from 'astro';
import { publicUrl, sitemapXml } from '../lib/seo/meta.ts';

// Só a home entra: as páginas /praia/<slug>/ são de compartilhamento e ficam fora do índice
// (noindex; ver docs/decisions.md).
export const GET: APIRoute = ({ site }) =>
  new Response(
    sitemapXml([publicUrl(site!.origin, import.meta.env.BASE_URL, '')]),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
