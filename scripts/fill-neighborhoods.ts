/**
 * Preenche o bairro que falta (catálogo e praias de referência) por consulta inversa do
 * OpenStreetMap (Nominatim: 1 req/s, cache local). Nunca memória nem Google. O bairro do
 * catálogo entra como NÃO conferido (`neighborhoodVerified: false`); só a página de revisão
 * grava `true`. Não altera bairro já preenchido.
 *
 *   npm run catalog:neighborhoods
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  readCatalogFile,
  writeCatalogFile,
} from '../src/lib/catalog/catalog-file.ts';
import type { ReferenceFile } from '../src/lib/catalog/reference.ts';
import { reverseNeighborhood } from '../src/dev/reverse-geocode.ts';

const path = (f: string) =>
  fileURLToPath(new URL(`../data/catalog/${f}`, import.meta.url));
const today = new Date().toISOString().slice(0, 10);

const prev = await readCatalogFile(path('salvador.json'));
const next = structuredClone(prev);
for (const b of next.beaches) {
  if (b.neighborhood) continue;
  const p = b.points.find((q) => q.lat !== null && q.lng !== null);
  if (!p) {
    console.log(`sem posição, sem bairro: ${b.name}`);
    continue;
  }
  const s = await reverseNeighborhood(p.lat!, p.lng!, today);
  if (!s) {
    console.log(`OSM não sabe o bairro: ${b.name}`);
    continue;
  }
  b.neighborhood = s.neighborhood;
  b.neighborhoodSource = s.source;
  b.neighborhoodVerified = false;
  console.log(`${b.name} -> ${s.neighborhood}`);
}
const errors = await writeCatalogFile(
  path('salvador.json'),
  prev,
  next,
  'auto',
);
if (errors.length) console.error(errors.join('\n'));

const refFile = path('reference-beaches.json');
const refs = JSON.parse(await readFile(refFile, 'utf8')) as ReferenceFile;
for (const r of refs.beaches) {
  if (r.neighborhood) continue;
  const s = await reverseNeighborhood(r.lat, r.lng, today);
  if (!s) {
    console.log(`OSM não sabe o bairro: ${r.name}`);
    continue;
  }
  r.neighborhood = s.neighborhood;
  r.neighborhoodSource = s.source;
  console.log(`${r.name} -> ${s.neighborhood}`);
}
await writeFile(refFile, `${JSON.stringify(refs, null, 2)}\n`, 'utf8');
