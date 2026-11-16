// Meta tags de SEO e de compartilhamento (Open Graph, Twitter). Funções puras, sem I/O.

export type HeadTag =
  | { tag: 'meta'; name?: string; property?: string; content: string }
  | { tag: 'link'; rel: string; href: string; [attr: string]: string };

export interface SeoImage {
  /** Endereço absoluto da imagem. */
  url: string;
  alt: string;
  width: number;
  height: number;
  /** Tipo MIME (ex.: "image/jpeg"). */
  type: string;
}

export interface SeoInput {
  title: string;
  description: string;
  /** Endereço absoluto desta página. */
  canonical: string;
  image: SeoImage;
  /** Páginas só de compartilhamento: fora do índice do Google. */
  noindex?: boolean;
}

export const SITE_NAME = 'Praieros';

/** Endereço absoluto de um arquivo público (raiz do site + caminho), com ou sem subcaminho. */
export function publicUrl(origin: string, base: string, path: string): string {
  const b = base.replace(/^\/+|\/+$/g, '');
  const p = path.replace(/^\/+/, '');
  return `${origin.replace(/\/+$/, '')}/${b ? `${b}/` : ''}${p}`;
}

export function seoTags(input: SeoInput): HeadTag[] {
  const { title, description, canonical, image, noindex } = input;
  const tags: HeadTag[] = [
    { tag: 'link', rel: 'canonical', href: canonical },
    {
      tag: 'meta',
      name: 'robots',
      content: noindex ? 'noindex, follow' : 'index, follow',
    },
    { tag: 'meta', property: 'og:type', content: 'website' },
    { tag: 'meta', property: 'og:site_name', content: SITE_NAME },
    { tag: 'meta', property: 'og:locale', content: 'pt_BR' },
    { tag: 'meta', property: 'og:title', content: title },
    { tag: 'meta', property: 'og:description', content: description },
    { tag: 'meta', property: 'og:url', content: canonical },
    { tag: 'meta', property: 'og:image', content: image.url },
    { tag: 'meta', property: 'og:image:type', content: image.type },
    { tag: 'meta', property: 'og:image:width', content: String(image.width) },
    {
      tag: 'meta',
      property: 'og:image:height',
      content: String(image.height),
    },
    { tag: 'meta', property: 'og:image:alt', content: image.alt },
    { tag: 'meta', name: 'twitter:card', content: 'summary_large_image' },
    { tag: 'meta', name: 'twitter:title', content: title },
    { tag: 'meta', name: 'twitter:description', content: description },
    { tag: 'meta', name: 'twitter:image', content: image.url },
    { tag: 'meta', name: 'twitter:image:alt', content: image.alt },
  ];
  return tags;
}

/** Dados estruturados da home (schema.org/WebSite), para o Google entender o que é o site. */
export function websiteJsonLd(input: {
  url: string;
  description: string;
}): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: input.url,
    description: input.description,
    inLanguage: 'pt-BR',
  });
}

/** Conteúdo do robots.txt: tudo liberado, com o endereço do sitemap. */
export function robotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

/** Conteúdo do sitemap.xml com as páginas que devem ser indexadas. */
export function sitemapXml(urls: string[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
}
