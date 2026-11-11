/**
 * Preenche uma PROPOSTA de bairro e coordenadas (centro da praia) a partir do
 * OpenStreetMap (Nominatim). Tudo entra com verified: false. Não mexe no que já
 * está verified: true. Descartes ficam em `proposalNote` e em docs/catalog-todo.md.
 *
 * Política de uso do Nominatim: no máximo 1 requisição por segundo, User-Agent
 * identificável, cache local (data/catalog/.cache/, ignorado pelo Git).
 * Contato opcional na variável de ambiente CATALOG_CONTACT (.env, fora do Git).
 *
 *   npm run catalog:propose
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  decideCandidate,
  queriesFor,
  type NominatimResult,
} from '../src/lib/catalog/propose.ts';
import type { Catalog } from '../src/lib/catalog/types.ts';
import { SALVADOR_BOUNDS } from '../src/lib/catalog/validate-catalog.ts';

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

async function search(query: string): Promise<NominatimResult[]> {
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

  const file = new URL(
    `${createHash('sha1').update(url.href).digest('hex')}.json`,
    CACHE,
  );
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // sem cache: consulta a rede
  }
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
  return data;
}

const catalog: Catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
let accepted = 0;
let discarded = 0;

for (const beach of catalog.beaches) {
  if (beach.points.some((p) => p.verified) || beach.neighborhoodVerified) {
    continue; // já conferida por uma pessoa
  }
  let reason = 'não encontrada';
  let decision = null;
  for (const query of queriesFor(beach.name)) {
    const d = decideCandidate(await search(query), query, today);
    if (d.ok) {
      decision = d;
      break;
    }
    reason = d.reason;
  }
  if (decision) {
    beach.neighborhood = decision.neighborhood;
    beach.neighborhoodSource = decision.neighborhood ? decision.source : null;
    beach.neighborhoodVerified = false;
    beach.proposalNote = null;
    for (const p of beach.points) {
      p.lat = decision.lat;
      p.lng = decision.lng;
      p.source = decision.source;
      p.verified = false;
    }
    accepted++;
  } else {
    beach.proposalNote = reason;
    discarded++;
  }
  console.log(
    `${decision ? 'PROPOSTA ' : 'DESCARTE '} ${beach.name}${decision ? '' : `: ${reason}`}`,
  );
}

await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`${accepted} propostas, ${discarded} descartes.`);
