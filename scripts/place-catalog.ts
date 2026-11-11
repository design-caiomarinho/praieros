/**
 * Posiciona automaticamente os pontos do catálogo (docs/decisions.md, sessão 8c). Nunca usa
 * memória nem API do Google: tudo vem do OpenStreetMap.
 *   1. Polígono administrativo de Salvador e geometria das praias (Overpass, uma consulta cada, com cache).
 *   2. Pista da descrição do local no Nominatim, limitado a Salvador; só vale a até 80 m da praia.
 *   3. Sem pista, distribui os pontos ao longo da geometria (mínimo de 40 m entre eles).
 *   4. Sem geometria no OSM: só a descrição, baixa confiança, não vai para produção.
 * Nunca altera ponto `verified: true` nem `manual`. Política de uso e cache em scripts/osm-client.ts.
 *
 *   npm run catalog:place            (grava data/catalog/salvador.json e docs/catalog-todo.md)
 *   npm run catalog:place -- --dry   (só mostra o resumo)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  readCatalogFile,
  writeCatalogFile,
} from '../src/lib/catalog/catalog-file.ts';
import { descriptionQuery } from '../src/lib/catalog/propose.ts';
import {
  applyPlans,
  BOUNDARY_QUERY,
  boundaryFromRelation,
  geometryForBeach,
  geometryQuery,
  isLocked,
  planBeach,
  pointState,
  type GeomElement,
  type PointPlan,
} from '../src/lib/catalog/placement.ts';
import { buildCatalogTodo } from '../src/lib/catalog/todo.ts';
import { currentBulletin } from '../src/lib/rules/evaluate.ts';
import { loadSalvadorInputs } from '../src/lib/site/load-data.ts';
import { overpassRaw, search } from './osm-client.ts';

const CATALOG = fileURLToPath(
  new URL('../data/catalog/salvador.json', import.meta.url),
);
const TODO = fileURLToPath(new URL('../docs/catalog-todo.md', import.meta.url));
const dry = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);

const { bulletins } = await loadSalvadorInputs();
const points = currentBulletin(bulletins)?.points ?? [];
const locations = Object.fromEntries(
  points.map((p) => [p.code, p.location ?? undefined]),
);
const prev = await readCatalogFile(CATALOG);

console.log('Polígono de Salvador (Overpass, com cache)…');
const rel = (await overpassRaw<{ elements: GeomElement[] }>(BOUNDARY_QUERY))
  .elements[0];
if (!rel) throw new Error('Relação de Salvador não encontrada no Overpass.');
const boundary = boundaryFromRelation(rel);
console.log(
  `  ${boundary.outer.length} anéis externos, ${boundary.inner.length} internos`,
);

console.log('Geometria das praias (Overpass, com cache)…');
const elements = (
  await overpassRaw<{ elements: GeomElement[] }>(geometryQuery())
).elements;
console.log(`  ${elements.length} elementos`);

const plans = new Map<string, PointPlan[]>();
for (const beach of prev.beaches) {
  const geometry = geometryForBeach(beach.name, elements);
  const clueResults: Record<string, Awaited<ReturnType<typeof search>>> = {};
  for (const p of beach.points) {
    const query = isLocked(p) ? null : descriptionQuery(locations[p.code]);
    if (query) clueResults[p.code] = await search(query, true);
  }
  plans.set(
    beach.name,
    planBeach({ beach, locations, geometry, boundary, clueResults, today }),
  );
  console.log(
    `  ${beach.name}: ${geometry ? `geometria ${geometry.ids.join(', ')}` : 'sem geometria no OSM'}`,
  );
}

const next = applyPlans(prev, plans);
const counts = { verified: 0, auto: 0, pending: 0, unplaced: 0 };
for (const b of next.beaches) for (const p of b.points) counts[pointState(p)]++;
console.log('\nResumo (pontos):', counts);

if (dry) {
  console.log('--dry: nada gravado.');
} else {
  const errors = await writeCatalogFile(CATALOG, prev, next, 'auto');
  if (errors.length > 0) {
    console.error('Não gravou:\n' + errors.map((e) => `  ${e}`).join('\n'));
    process.exit(1);
  }
  await writeFile(TODO, buildCatalogTodo(next, points), 'utf8');
  console.log(`Gravado ${CATALOG}\nGravado ${TODO}`);
}
