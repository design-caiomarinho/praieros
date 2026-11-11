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
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  overpassQuery,
  resolveBeach,
  type NominatimResult,
  type OverpassElement,
} from '../src/lib/catalog/propose.ts';
import { cached, headers, search } from './osm-client.ts';
import { currentBulletin } from '../src/lib/rules/evaluate.ts';
import { loadSalvadorInputs } from '../src/lib/site/load-data.ts';

const CATALOG = fileURLToPath(
  new URL('../data/catalog/salvador.json', import.meta.url),
);

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
