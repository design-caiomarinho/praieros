/**
 * Acesso ao Nominatim e ao Overpass, compartilhado pelos scripts do catálogo.
 * Política de uso: no máximo 1 requisição por segundo, User-Agent identificável,
 * cache local (data/catalog/.cache/, ignorado pelo Git). Contato opcional na
 * variável de ambiente CATALOG_CONTACT (.env, fora do Git).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { NominatimResult } from '../src/lib/catalog/propose.ts';
import { SALVADOR_BOUNDS } from '../src/lib/catalog/validate-catalog.ts';

const CACHE = new URL('../data/catalog/.cache/', import.meta.url);
const contact = process.env.CATALOG_CONTACT?.trim();
const USER_AGENT = contact
  ? `praieros-catalog/0.1 (contato: ${contact})`
  : 'praieros-catalog/0.1';
const MIN_INTERVAL_MS = 1100;
let lastRequest = 0;

/** Lê do cache ou consulta a rede (respeitando 1 requisição por segundo) e guarda. */
export async function cached<T>(key: string, request: () => Promise<Response>) {
  const file = new URL(
    `${createHash('sha1').update(key).digest('hex')}.json`,
    CACHE,
  );
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    // sem cache: consulta a rede
  }
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  let res = await request();
  // Servidores públicos às vezes respondem 502/503/504 quando ocupados: até 2 novas tentativas, com pausa.
  for (
    let retry = 0;
    retry < 2 && [502, 503, 504].includes(res.status);
    retry++
  ) {
    await new Promise((r) => setTimeout(r, 30_000));
    lastRequest = Date.now();
    res = await request();
  }
  if (!res.ok)
    throw new Error(`${new URL(res.url).host} respondeu ${res.status}`);
  const data = (await res.json()) as T;
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
  return data;
}

export const headers = { 'User-Agent': USER_AGENT };

/** Busca no Nominatim com preferência pela caixa de Salvador; `bounded` recusa resultados de fora dela. */
export function search(query: string, bounded = false) {
  const [south, north] = SALVADOR_BOUNDS.lat;
  const [west, east] = SALVADOR_BOUNDS.lng;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  const params: Record<string, string> = {
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '10',
    countrycodes: 'br',
    viewbox: `${west},${north},${east},${south}`,
  };
  if (bounded) params.bounded = '1';
  url.search = new URLSearchParams(params).toString();
  return cached<NominatimResult[]>(url.href, () => fetch(url, { headers }));
}

/** Consulta do Overpass (POST), com cache. */
export function overpassRaw<T>(query: string) {
  return cached<T>(query, () =>
    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ data: query }),
    }),
  );
}
