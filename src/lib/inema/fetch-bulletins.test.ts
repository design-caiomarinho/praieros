import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BULLETIN_PAGE_URL,
  fetchBulletinPdfs,
  findRegionLinks,
  normalizeLabel,
  type FetchFn,
} from './fetch-bulletins.ts';

const PAGE = readFileSync(
  new URL('../../../fixtures/qualidade-das-praias.html', import.meta.url),
  'utf8',
);
const PDF = new TextEncoder().encode('%PDF-1.7 conteudo');
const FAST = { retryDelayMs: 0, timeoutMs: 1000 };

const html = (...links: [string, string][]) =>
  `<html><body>${links.map(([t, h]) => `<a href="${h}">${t}</a>`).join('')}</body></html>`;

describe('normalizeLabel', () => {
  it('ignora caixa, acento, hífen e espaços', () => {
    expect(normalizeLabel('  Baía de  Todos-os-Santos ')).toBe(
      'baia de todos os santos',
    );
    expect(normalizeLabel('BAÍA DE TODOS-OS-SANTOS')).toBe(
      'baia de todos os santos',
    );
  });
});

describe('findRegionLinks', () => {
  it('acha as duas regiões na página real salva', () => {
    const links = findRegionLinks(PAGE);
    expect(links.SALVADOR).toMatchObject({ ok: true });
    expect(links['BAÍA DE TODOS-OS-SANTOS']).toMatchObject({ ok: true });
    if (links.SALVADOR.ok) {
      expect(links.SALVADOR.url).toMatch(
        /^https:\/\/www\.ba\.gov\.br\/.*\.pdf$/,
      );
    }
  });

  it('não confunde outras regiões com as do escopo', () => {
    const links = findRegionLinks(
      html(['COSTA DOS COQUEIROS - LITORAL NORTE', '/a.pdf']),
    );
    expect(links.SALVADOR.ok).toBe(false);
  });

  it('aceita variação de caixa e acento e resolve URL relativa', () => {
    const links = findRegionLinks(
      html(
        ['Salvador', '/x/salvador.pdf'],
        ['Baia de Todos os Santos', 'bts.pdf'],
      ),
      'https://exemplo.test/a/b',
    );
    expect(links.SALVADOR).toEqual({
      ok: true,
      url: 'https://exemplo.test/x/salvador.pdf',
    });
    expect(links['BAÍA DE TODOS-OS-SANTOS']).toEqual({
      ok: true,
      url: 'https://exemplo.test/a/bts.pdf',
    });
  });

  it('rótulo ausente vira erro explícito, sem montar URL', () => {
    const links = findRegionLinks(html(['SALVADOR', '/s.pdf']));
    expect(links['BAÍA DE TODOS-OS-SANTOS']).toMatchObject({ ok: false });
  });

  it('rótulo repetido com endereços diferentes é ambíguo; com o mesmo endereço, não', () => {
    const amb = findRegionLinks(
      html(['SALVADOR', '/a.pdf'], ['SALVADOR', '/b.pdf']),
    );
    expect(amb.SALVADOR).toMatchObject({ ok: false });
    const dup = findRegionLinks(
      html(['SALVADOR', '/a.pdf'], ['SALVADOR', '/a.pdf']),
    );
    expect(dup.SALVADOR.ok).toBe(true);
  });

  it('ignora href que não é http(s)', () => {
    const links = findRegionLinks(html(['SALVADOR', 'javascript:void(0)']));
    expect(links.SALVADOR.ok).toBe(false);
  });
});

type Handler = () => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Handler>): FetchFn {
  return vi.fn(async (input: Parameters<FetchFn>[0]) => {
    const handler = routes[String(input)];
    if (!handler) return new Response('nope', { status: 404 });
    return handler();
  }) as unknown as FetchFn;
}

const PAGE_HTML = html(
  ['SALVADOR', '/s.pdf'],
  ['BAÍA DE TODOS-OS-SANTOS', '/b.pdf'],
);
const base = new URL(BULLETIN_PAGE_URL).origin;
const pageOk: Handler = () => new Response(PAGE_HTML);
const pdfOk: Handler = () => new Response(PDF);

describe('fetchBulletinPdfs', () => {
  it('baixa os dois PDFs', async () => {
    const fetchFn = fakeFetch({
      [BULLETIN_PAGE_URL]: pageOk,
      [`${base}/s.pdf`]: pdfOk,
      [`${base}/b.pdf`]: pdfOk,
    });
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST });
    expect(res.ok).toBe(true);
    expect(res.regions.map((r) => r.ok)).toEqual([true, true]);
  });

  it('página fora do ar: devolve erro, não lança', async () => {
    const fetchFn = (() =>
      Promise.reject(new TypeError('fetch failed'))) as unknown as FetchFn;
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('fetch failed');
  });

  it('timeout é tratado como falha de rede', async () => {
    const fetchFn = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      })) as unknown as FetchFn;
    const res = await fetchBulletinPdfs({
      fetchFn,
      timeoutMs: 20,
      retries: 0,
      retryDelayMs: 0,
    });
    expect(res.ok).toBe(false);
  });

  it('uma região falha (404) e a outra segue', async () => {
    const fetchFn = fakeFetch({
      [BULLETIN_PAGE_URL]: pageOk,
      [`${base}/b.pdf`]: pdfOk,
    });
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST });
    expect(res.regions[0]).toMatchObject({ ok: false, region: 'SALVADOR' });
    expect(res.regions[1]).toMatchObject({ ok: true });
  });

  it('5xx tenta de novo e depois dá certo', async () => {
    let n = 0;
    const flaky: Handler = () =>
      ++n === 1 ? new Response('', { status: 503 }) : pdfOk();
    const fetchFn = fakeFetch({
      [BULLETIN_PAGE_URL]: pageOk,
      [`${base}/s.pdf`]: flaky,
      [`${base}/b.pdf`]: pdfOk,
    });
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST });
    expect(res.regions.every((r) => r.ok)).toBe(true);
    expect(n).toBe(2);
  });

  it('404 não repete a requisição', async () => {
    const fetchFn = fakeFetch({ [BULLETIN_PAGE_URL]: pageOk });
    await fetchBulletinPdfs({ fetchFn, ...FAST });
    const calls = vi
      .mocked(fetchFn)
      .mock.calls.filter(([u]) => String(u).endsWith('/s.pdf'));
    expect(calls).toHaveLength(1);
  });

  it('5xx persistente falha depois das tentativas', async () => {
    const fetchFn = fakeFetch({
      [BULLETIN_PAGE_URL]: pageOk,
      [`${base}/s.pdf`]: () => new Response('', { status: 500 }),
      [`${base}/b.pdf`]: pdfOk,
    });
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST, retries: 2 });
    expect(res.regions[0]).toMatchObject({ ok: false });
  });

  it('corpo que não é PDF é rejeitado', async () => {
    const fetchFn = fakeFetch({
      [BULLETIN_PAGE_URL]: pageOk,
      [`${base}/s.pdf`]: () => new Response('<html>erro</html>'),
      [`${base}/b.pdf`]: pdfOk,
    });
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST });
    expect(res.regions[0]).toMatchObject({ ok: false });
    const first = res.regions[0];
    if (!first.ok) expect(first.reason).toContain('não é um PDF');
  });

  it('link ausente na página vira falha só daquela região', async () => {
    const fetchFn = fakeFetch({
      [BULLETIN_PAGE_URL]: () => new Response(html(['SALVADOR', '/s.pdf'])),
      [`${base}/s.pdf`]: pdfOk,
    });
    const res = await fetchBulletinPdfs({ fetchFn, ...FAST });
    expect(res.regions.map((r) => r.ok)).toEqual([true, false]);
  });
});
