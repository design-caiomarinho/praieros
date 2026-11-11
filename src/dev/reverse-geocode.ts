import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { NominatimResult } from '../lib/catalog/propose.ts';
import { reverseSuggestion } from '../lib/catalog/review.ts';

// Consulta inversa do Nominatim (mesma fonte do catálogo). Política de uso: no máximo 1
// requisição por segundo, User-Agent identificável e cache local (ignorado pelo Git).
const CACHE = new URL('../../data/catalog/.cache/', import.meta.url);
const contact = process.env.CATALOG_CONTACT?.trim();
const USER_AGENT = contact
  ? `praieros-catalog/0.1 (contato: ${contact})`
  : 'praieros-catalog/0.1';
const MIN_INTERVAL_MS = 1100;
let lastRequest = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Posição arredondada (~1 m) para o cache servir cliques muito próximos. */
const round = (n: number) => n.toFixed(5);

async function fetchReverse(lat: number, lng: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('accept-language', 'pt-BR');
  url.searchParams.set('lat', round(lat));
  url.searchParams.set('lon', round(lng));
  const file = new URL(
    `${createHash('sha1').update(url.href).digest('hex')}.json`,
    CACHE,
  );
  try {
    return JSON.parse(await readFile(file, 'utf8')) as NominatimResult;
  } catch {
    // sem cache: consulta a rede
  }
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
  const data = (await res.json()) as NominatimResult & { error?: string };
  if (data.error) throw new Error(`Nominatim: ${data.error}`);
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
  return data;
}

/** Sugere o bairro de uma posição. Consultas em fila, uma por vez. Null se o OSM não souber. */
export function reverseNeighborhood(lat: number, lng: number, today: string) {
  const run = chain.then(async () => {
    const result = await fetchReverse(lat, lng);
    return reverseSuggestion(result, lat, lng, today);
  });
  chain = run.catch(() => undefined);
  return run;
}
