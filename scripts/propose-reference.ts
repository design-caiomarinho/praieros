/**
 * Lista as praias com nome do OpenStreetMap (natural=beach) dentro de Salvador que NÃO constam
 * no boletim e grava em data/catalog/reference-beaches.json (docs/decisions.md, sessão 10).
 * Só OpenStreetMap (Overpass, com cache, 1 requisição por segundo; scripts/osm-client.ts);
 * nunca memória nem Google. Ignora os nomes de data/catalog/reference-exclude.json.
 *
 *   npm run catalog:reference
 *   npm run catalog:reference -- --dry   (só mostra o relatório)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  boundaryFromRelation,
  BOUNDARY_QUERY,
  geometryQuery,
  type GeomElement,
} from '../src/lib/catalog/placement.ts';
import {
  pickReferenceBeaches,
  type ReferenceFile,
} from '../src/lib/catalog/reference.ts';
import { loadSalvadorInputs } from '../src/lib/site/load-data.ts';
import { loadNameHints, overpassRaw } from './osm-client.ts';

const OUT = fileURLToPath(
  new URL('../data/catalog/reference-beaches.json', import.meta.url),
);
const dry = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);

const { bulletins, catalog, referenceExclude } = await loadSalvadorInputs();
const hints = await loadNameHints();

const rel = (await overpassRaw<{ elements: GeomElement[] }>(BOUNDARY_QUERY))
  .elements[0];
if (!rel) throw new Error('Relação de Salvador não encontrada no Overpass.');
const boundary = boundaryFromRelation(rel);
// Mesma consulta do posicionamento: sai do cache.
const elements = (
  await overpassRaw<{ elements: GeomElement[] }>(geometryQuery())
).elements;

// Praias conhecidas: catálogo + todos os nomes de todos os boletins (inclui o que o site não exibe).
const known = new Map<
  string,
  { name: string; points: { lat: number; lng: number }[] }
>();
for (const b of catalog.beaches) {
  known.set(b.name, {
    name: b.name,
    points: b.points.flatMap((p) =>
      p.lat !== null && p.lng !== null ? [{ lat: p.lat, lng: p.lng }] : [],
    ),
  });
}
for (const bulletin of bulletins) {
  for (const p of bulletin.points) {
    if (!known.has(p.beach)) known.set(p.beach, { name: p.beach, points: [] });
  }
}

const result = pickReferenceBeaches({
  elements,
  boundary,
  known: [...known.values()],
  hints,
  exclude: referenceExclude,
  today,
});

console.log(
  `OSM: ${result.references.length} praias de referência; ${result.matched.length} casaram com o boletim/catálogo; ${result.outside.length} fora de Salvador; ${result.excluded.length} excluídas.`,
);
console.log('\nPraias de referência:');
for (const r of result.references) {
  console.log(
    `  ${r.name}  (${r.osmType}/${r.osmId}  ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)})`,
  );
}
console.log('\nSuspeitas de duplicata (referência x praia do boletim):');
if (result.suspects.length === 0) console.log('  nenhuma');
for (const s of result.suspects) {
  const why = s.reasons
    .map((r) => (r === 'near' ? 'a menos de 300 m' : 'nome parecido'))
    .join(' + ');
  console.log(
    `  "${s.reference}"  x  "${s.known}"  ${s.distanceM === null ? 'distância n/d' : `${s.distanceM} m`}  [${why}]`,
  );
}

if (!dry) {
  const file: ReferenceFile = {
    schemaVersion: 1,
    region: 'salvador',
    beaches: result.references,
  };
  await writeFile(OUT, JSON.stringify(file, null, 2) + '\n', 'utf8');
  console.log(`\nGravado em ${OUT}`);
}
