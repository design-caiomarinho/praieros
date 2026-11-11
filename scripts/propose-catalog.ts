/**
 * Preenche uma PROPOSTA de bairro e coordenadas a partir do OpenStreetMap, em
 * etapas: (1) variações do nome no Nominatim, (2) lista do Overpass (praias,
 * lagoas e marinas), (3) descrição do local do boletim. Tudo entra com
 * verified: false. Só mexe em pontos sem posição e nunca em entradas verificadas.
 * Descartes ficam em `proposalNote` e em docs/catalog-todo.md.
 *
 * Política de uso: no máximo 1 requisição por segundo, User-Agent identificável,
 * cache local (data/catalog/.cache/, ignorado pelo Git). Contato opcional na
 * variável de ambiente CATALOG_CONTACT (.env, fora do Git).
 *
 *   npm run catalog:propose
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  overpassQuery,
  resolveBeach,
  type NominatimResult,
  type OverpassElement,
} from '../src/lib/catalog/propose.ts';
import { SALVADOR_BOUNDS } from '../src/lib/catalog/validate-catalog.ts';
import { currentBulletin } from '../src/lib/rules/evaluate.ts';
import { loadSalvadorInputs } from '../src/lib/site/load-data.ts';

const CATALOG = fileURLToPath(
  new URL('../data/catalog/salvador.json', import.meta.url),
);
const CACHE = new URL('../data/catalog/.cache/', import.meta.url);
const contact = process.env.CATALOG_CONTACT?.trim();
const USER_AGENT = contact
  ? `praieros-catalog/0.1 (contato: ${contact})`
  : 'praieros-catalog/0.1';
const MIN_INTERVAL_MS = 1100;
let lastRequest = 0;

/** Lê do cache ou consulta a rede (respeitando 1 requisição por segundo) e guarda. */
async function cached<T>(key: string, request: () => Promise<Response>) {
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

const headers = { 'User-Agent': USER_AGENT };

function search(query: string) {
  const [south, north] = SALVADOR_BOUNDS.lat;
  const [west, east] = SALVADOR_BOUNDS.lng;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '10',
    countrycodes: 'br',
    viewbox: `${west},${north},${east},${south}`,
  }).toString();
  return cached<NominatimResult[]>(url.href, () => fetch(url, { headers }));
}

async function reverse(lat: number, lng: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '16',
  }).toString();
  const data = await cached<NominatimResult & { error?: string }>(
    url.href,
    () => fetch(url, { headers }),
  );
  return data.error ? null : data;
}

async function overpass() {
  const query = overpassQuery();
  const data = await cached<{ elements: OverpassElement[] }>(query, () =>
    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ data: query }),
    }),
  );
  return data.elements;
}

const { catalog, bulletins } = await loadSalvadorInputs();
const locations = new Map(
  (currentBulletin(bulletins)?.points ?? []).map((p) => [p.code, p.location]),
);
const today = new Date().toISOString().slice(0, 10);
const deps = { search, overpass, reverse, today };
let proposed = 0;
let discarded = 0;

for (const beach of catalog.beaches) {
  if (beach.points.some((p) => p.verified) || beach.neighborhoodVerified) {
    continue; // já conferida por uma pessoa
  }
  const pending = beach.points.filter((p) => p.lat === null || p.lng === null);
  if (pending.length === 0) continue; // já tem proposta
  const result = await resolveBeach(
    beach.name,
    pending.map((p) => ({
      code: p.code,
      location: locations.get(p.code) ?? null,
    })),
    deps,
  );
  for (const found of result.points) {
    const p = pending.find((x) => x.code === found.code)!;
    p.lat = found.lat;
    p.lng = found.lng;
    p.source = found.source;
    p.verified = false;
  }
  if (beach.neighborhood === null && result.neighborhood) {
    beach.neighborhood = result.neighborhood;
    beach.neighborhoodSource = result.neighborhoodSource;
    beach.neighborhoodVerified = false;
  }
  beach.proposalNote = result.note;
  const methods = [...new Set(result.points.map((p) => p.source.method))];
  if (result.points.length > 0) proposed++;
  else discarded++;
  console.log(
    `${result.points.length > 0 ? 'PROPOSTA' : 'DESCARTE'}  ${beach.name}` +
      (methods.length ? ` [${methods.join(', ')}]` : '') +
      (result.note ? `: ${result.note}` : ''),
  );
}

await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`${proposed} praias com proposta nova, ${discarded} descartadas.`);
