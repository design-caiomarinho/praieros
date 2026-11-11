import * as cheerio from 'cheerio';

export const BULLETIN_PAGE_URL =
  'https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias';

/** Rótulos das regiões no escopo. Os links são achados por estes rótulos, nunca montados. */
export const REGION_LABELS = ['SALVADOR', 'BAÍA DE TODOS-OS-SANTOS'] as const;
export type RegionLabel = (typeof REGION_LABELS)[number];

export type LinkResult =
  { ok: true; url: string } | { ok: false; reason: string };
export type RegionLinks = Record<RegionLabel, LinkResult>;

export type PdfResult =
  | { ok: true; region: RegionLabel; url: string; bytes: Uint8Array }
  | { ok: false; region: RegionLabel; reason: string };

export type FetchResult =
  | { ok: true; html: string; regions: PdfResult[] }
  | { ok: false; reason: string; regions: [] };

export type FetchFn = typeof fetch;

export interface FetchOptions {
  fetchFn?: FetchFn;
  pageUrl?: string;
  timeoutMs?: number;
  /** Tentativas extras após a primeira (só para erro de rede, timeout e 5xx). */
  retries?: number;
  retryDelayMs?: number;
}

const USER_AGENT =
  'praieros-bulletin-reader/0.1 (site independente, sem vínculo com o Inema)';

/** Minúsculas, sem acentos, só letras/números separados por um espaço. */
export function normalizeLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Acha, no HTML da página, o link de cada região pelo rótulo do link.
 * Pura: sem I/O. Rótulo ausente ou apontando para URLs diferentes vira erro.
 */
export function findRegionLinks(
  html: string,
  baseUrl: string = BULLETIN_PAGE_URL,
): RegionLinks {
  const $ = cheerio.load(html);
  const found = new Map<RegionLabel, Set<string>>(
    REGION_LABELS.map((l) => [l, new Set()]),
  );

  $('a[href]').each((_, el) => {
    const text = normalizeLabel($(el).text());
    const label = REGION_LABELS.find((l) => normalizeLabel(l) === text);
    if (!label) return;
    try {
      const url = new URL($(el).attr('href') ?? '', baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:')
        found.get(label)?.add(url.href);
    } catch {
      // href inválido: ignorar
    }
  });

  const result = {} as RegionLinks;
  for (const label of REGION_LABELS) {
    const urls = [...(found.get(label) ?? [])];
    if (urls.length === 0) {
      result[label] = {
        ok: false,
        reason: `Link "${label}" não encontrado na página.`,
      };
    } else if (urls.length > 1) {
      result[label] = {
        ok: false,
        reason: `Link "${label}" ambíguo: ${urls.length} endereços diferentes.`,
      };
    } else {
      result[label] = { ok: true, url: urls[0] };
    }
  }
  return result;
}

type BytesResult =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

async function fetchBytes(
  url: string,
  o: Required<FetchOptions>,
): Promise<BytesResult> {
  let lastReason = 'falha desconhecida';
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, o.retryDelayMs));
    try {
      const res = await o.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(o.timeoutMs),
      });
      if (res.status >= 500) {
        lastReason = `HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) };
    } catch (err) {
      lastReason = `erro de rede: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { ok: false, reason: lastReason };
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5 &&
    new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-'
  );
}

/** Baixa um PDF de região a partir do resultado de `findRegionLinks`. Nunca lança. */
export async function downloadRegionPdf(
  region: RegionLabel,
  link: LinkResult,
  options: Required<FetchOptions>,
): Promise<PdfResult> {
  if (!link.ok) return { ok: false, region, reason: link.reason };
  const res = await fetchBytes(link.url, options);
  if (!res.ok)
    return { ok: false, region, reason: `${link.url}: ${res.reason}` };
  if (!isPdf(res.bytes)) {
    return {
      ok: false,
      region,
      reason: `${link.url}: o arquivo baixado não é um PDF.`,
    };
  }
  return { ok: true, region, url: link.url, bytes: res.bytes };
}

/**
 * Abre a página do Inema, acha os links das regiões pelo rótulo e baixa os PDFs.
 * Nunca lança: falhas voltam no resultado, por região. O chamador decide (D4).
 */
export async function fetchBulletinPdfs(
  options: FetchOptions = {},
): Promise<FetchResult> {
  const o: Required<FetchOptions> = {
    fetchFn: options.fetchFn ?? fetch,
    pageUrl: options.pageUrl ?? BULLETIN_PAGE_URL,
    timeoutMs: options.timeoutMs ?? 20_000,
    retries: options.retries ?? 1,
    retryDelayMs: options.retryDelayMs ?? 1_000,
  };

  const page = await fetchBytes(o.pageUrl, o);
  if (!page.ok) {
    return {
      ok: false,
      reason: `Página do Inema indisponível: ${page.reason}`,
      regions: [],
    };
  }
  const html = new TextDecoder().decode(page.bytes);
  const links = findRegionLinks(html, o.pageUrl);
  const regions = await Promise.all(
    REGION_LABELS.map((l) => downloadRegionPdf(l, links[l], o)),
  );
  return { ok: true, html, regions };
}
