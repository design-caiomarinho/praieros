import { describe, expect, it } from 'vitest';
import {
  publicUrl,
  robotsTxt,
  seoTags,
  sitemapXml,
  websiteJsonLd,
  type SeoInput,
} from './meta.ts';

const input: SeoInput = {
  title: 'Praieros',
  description: 'Balneabilidade das praias de Salvador.',
  canonical: 'https://x.dev/praieros/',
  image: {
    url: 'https://x.dev/praieros/og.jpg',
    alt: 'Logo do Praieros sobre o mapa',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
  },
};

const find = (tags: ReturnType<typeof seoTags>, key: string) =>
  tags.find(
    (t) =>
      ('property' in t && t.property === key) ||
      ('name' in t && t.name === key),
  );

describe('publicUrl', () => {
  it('junta origem, subcaminho e arquivo sem barras duplicadas', () => {
    expect(publicUrl('https://x.dev/', '/praieros/', '/og.jpg')).toBe(
      'https://x.dev/praieros/og.jpg',
    );
    expect(publicUrl('https://x.dev', '/', 'og.jpg')).toBe(
      'https://x.dev/og.jpg',
    );
  });
});

describe('seoTags', () => {
  it('traz canonical, Open Graph e Twitter com a imagem e o texto alternativo', () => {
    const tags = seoTags(input);
    expect(tags).toContainEqual({
      tag: 'link',
      rel: 'canonical',
      href: 'https://x.dev/praieros/',
    });
    expect(find(tags, 'og:image')).toMatchObject({
      content: 'https://x.dev/praieros/og.jpg',
    });
    expect(find(tags, 'og:image:width')).toMatchObject({ content: '1200' });
    expect(find(tags, 'og:image:alt')).toMatchObject({
      content: 'Logo do Praieros sobre o mapa',
    });
    expect(find(tags, 'twitter:card')).toMatchObject({
      content: 'summary_large_image',
    });
    expect(find(tags, 'og:locale')).toMatchObject({ content: 'pt_BR' });
  });

  it('indexa por padrão e marca noindex quando pedido', () => {
    expect(find(seoTags(input), 'robots')).toMatchObject({
      content: 'index, follow',
    });
    expect(find(seoTags({ ...input, noindex: true }), 'robots')).toMatchObject({
      content: 'noindex, follow',
    });
  });
});

describe('websiteJsonLd', () => {
  it('descreve o site em pt-BR', () => {
    const ld = JSON.parse(
      websiteJsonLd({ url: 'https://x.dev/', description: 'd' }),
    );
    expect(ld['@type']).toBe('WebSite');
    expect(ld.inLanguage).toBe('pt-BR');
    expect(ld.url).toBe('https://x.dev/');
  });
});

describe('robotsTxt e sitemapXml', () => {
  it('robots libera tudo e aponta o sitemap', () => {
    expect(robotsTxt('https://x.dev/sitemap.xml')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://x.dev/sitemap.xml\n',
    );
  });

  it('sitemap lista as páginas e escapa caracteres especiais', () => {
    const xml = sitemapXml(['https://x.dev/', 'https://x.dev/?a=1&b=2']);
    expect(xml).toContain('<loc>https://x.dev/</loc>');
    expect(xml).toContain('<loc>https://x.dev/?a=1&amp;b=2</loc>');
  });
});
