/**
 * Posiciona automaticamente TODOS os pontos do catálogo (docs/decisions.md, sessões 8c e 8d).
 * Só OpenStreetMap (Overpass e Nominatim); nunca memória nem Google. Nunca grava `verified`.
 *   g) geometria da praia no OSM (dentro de Salvador): pista da descrição a ≤80 m, ou distribuído.
 * Para o que o nível g não posicionou, do mais confiável ao menos (para no primeiro que passa):
 *   a) referências da descrição   b) nome da praia   c) bairro ou localidade
 *   d) interpolação pela ordem do boletim ao longo do litoral (só se a ordem for consistente)
 *   e) último recurso: ponto do litoral mais próximo do centro dos vizinhos
 * Verificações: dentro do polígono de Salvador; ≤150 m do litoral (a–e); 40 m entre pontos da praia.
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
import {
  beachNameQueries,
  coastFromElements,
  coastQuery,
  localityQueries,
  planLevels,
  referenceQueries,
} from '../src/lib/catalog/levels.ts';
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
import { loadNameHints, overpassRaw, search } from './osm-client.ts';

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
const order = points.map((p) => p.code);
const prev = await readCatalogFile(CATALOG);
const hints = await loadNameHints();

console.log('Polígono de Salvador (Overpass, com cache)…');
const rel = (await overpassRaw<{ elements: GeomElement[] }>(BOUNDARY_QUERY))
  .elements[0];
if (!rel) throw new Error('Relação de Salvador não encontrada no Overpass.');
const boundary = boundaryFromRelation(rel);

console.log('Geometria das praias e litoral (Overpass, com cache)…');
const elements = (
  await overpassRaw<{ elements: GeomElement[] }>(geometryQuery())
).elements;
const coast = coastFromElements(
  (await overpassRaw<{ elements: GeomElement[] }>(coastQuery())).elements,
);
console.log(
  `  ${elements.length} elementos de praia; litoral: ${coast.geometry.lines.length} cadeias (principal com ${coast.chain.length} vértices)`,
);

// Nível g.
const plans = new Map<string, PointPlan[]>();
for (const beach of prev.beaches) {
  const geometry = geometryForBeach(beach.name, elements, hints, boundary);
  const clueResults: Record<string, Awaited<ReturnType<typeof search>>> = {};
  for (const p of beach.points) {
    const query = isLocked(p) ? null : descriptionQuery(locations[p.code]);
    if (geometry && query) clueResults[p.code] = await search(query, true);
  }
  plans.set(
    beach.name,
    planBeach({ beach, locations, geometry, boundary, clueResults, today }),
  );
}
const afterG = applyPlans(prev, plans);

// Níveis a–e para o que sobrou: busca todas as consultas necessárias (cache, 1 por segundo).
const lookup: Record<string, Awaited<ReturnType<typeof search>>> = {};
for (const b of afterG.beaches) {
  for (const p of b.points) {
    if (isLocked(p) || p.lat !== null) continue;
    const loc = locations[p.code];
    const queries = [
      ...referenceQueries(loc),
      ...beachNameQueries(b.name, hints),
      ...localityQueries(b.name, loc, hints),
    ];
    for (const q of queries) lookup[q] ??= await search(q, true);
  }
}
const levels = planLevels({
  catalog: afterG,
  order,
  locations,
  hints,
  boundary,
  coast,
  lookup,
  today,
});
const next = applyPlans(afterG, levels.plans);

const o = levels.order;
console.log(
  `\nOrdem do boletim x litoral: ${o.used} pontos usados, tau ${o.tau} (${o.consistent ? 'CONSISTENTE' : 'INCONSISTENTE'}, mínimo 0,95), ${o.inversions.length} inversões, sentido ${o.direction > 0 ? 'igual ao da cadeia' : 'inverso ao da cadeia'}`,
);
if (o.inversions.length)
  console.log(
    '  inversões:',
    o.inversions.map((p) => p.join(' > ')).join('; '),
  );
if (o.excluded.length)
  console.log('  fora da cadeia (>150 m):', o.excluded.join(', '));

const counts: Record<string, number> = {};
for (const b of next.beaches) {
  for (const p of b.points) {
    const key =
      p.source?.method === 'auto-placed'
        ? `nível ${p.source.level ?? 'g'}`
        : pointState(p);
    counts[key] = (counts[key] ?? 0) + 1;
  }
}
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
