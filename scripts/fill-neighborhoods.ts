/**
 * Preenche o bairro de cada praia (catálogo e praias de referência) por ponto-em-polígono, só
 * com o OpenStreetMap: baixa de uma vez os polígonos de bairro de Salvador (Overpass,
 * `admin_level=10`, com cache, 1 requisição por segundo) e vê em qual cai a posição dos pontos
 * de alta confiança (níveis g, a, b ou aprovados à mão). Nunca memória nem Google.
 *
 *   - Pontos só de nível c, d ou e: não preenche (posição muito aproximada); grava o motivo.
 *   - Pontos em bairros diferentes: vence o mais frequente; empate = não preenche, com motivo.
 *   - Nunca grava `verified`. Bairro conferido ou corrigido à mão (`neighborhoodVerified`) não
 *     é tocado. O bairro automático substitui o `reverse` antigo (não conferido).
 *   - A tabela de nomes (`data/catalog/neighborhood-names.json`) não é aplicada aqui: o catálogo
 *     guarda o nome do OSM; a tabela só vale na leitura.
 *
 *   npm run catalog:neighborhoods
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  readCatalogFile,
  writeCatalogFile,
} from '../src/lib/catalog/catalog-file.ts';
import {
  areasFromElements,
  decideNeighborhood,
  decideReferenceNeighborhood,
  neighborhoodAreasQuery,
  neighborhoodPointOf,
  polygonSource,
  displayNeighborhood,
  type NeighborhoodDecision,
  type NeighborhoodPoint,
} from '../src/lib/catalog/neighborhood.ts';
import type { GeomElement } from '../src/lib/catalog/placement.ts';
import type { ReferenceFile } from '../src/lib/catalog/reference.ts';
import { SALVADOR_BOUNDS as B } from '../src/lib/catalog/validate-catalog.ts';
import { buildSiteModel } from '../src/lib/site/build-beach-models.ts';
import { loadSalvadorInputs, NOT_BEACHES } from '../src/lib/site/load-data.ts';
import { suggestNeighborhoods } from '../src/lib/search/search.ts';
import { overpassRaw } from './osm-client.ts';

const path = (f: string) =>
  fileURLToPath(new URL(`../data/catalog/${f}`, import.meta.url));
const today = new Date().toISOString().slice(0, 10);

const response = await overpassRaw<{ elements: GeomElement[] }>(
  neighborhoodAreasQuery(B.lat[0], B.lng[0], B.lat[1], B.lng[1]),
);
const areas = areasFromElements(response.elements);
console.log(`Polígonos de bairro (admin_level 10) no OSM: ${areas.length}\n`);

interface Row {
  kind: 'boletim' | 'referência' | 'conferido';
  name: string;
  osmName: string | null;
  confidence: string | null;
  reason: string;
}
const rows: Row[] = [];
const hide = new Set(NOT_BEACHES.map((n) => n.toLowerCase()));

// Catálogo (praias do boletim).
const prev = await readCatalogFile(path('salvador.json'));
const next = structuredClone(prev);
for (const b of next.beaches) {
  if (hide.has(b.name.toLowerCase())) continue; // não é praia: fora da exibição
  if (b.neighborhoodVerified) {
    rows.push({
      kind: 'conferido',
      name: b.name,
      osmName: b.neighborhood,
      confidence: null,
      reason: 'conferido à mão: mantido',
    });
    continue;
  }
  const trusted: NeighborhoodPoint[] = [];
  const skipped: { label: string; skipped: string }[] = [];
  for (const p of b.points) {
    const r = neighborhoodPointOf(p);
    if ('skipped' in r) skipped.push(r);
    else trusted.push(r);
  }
  const d: NeighborhoodDecision = decideNeighborhood(trusted, skipped, areas);
  if (d.ok) {
    b.neighborhood = d.area.name;
    b.neighborhoodSource = polygonSource(d, today);
    b.neighborhoodNote = null;
  } else {
    b.neighborhood = null;
    b.neighborhoodSource = null;
    b.neighborhoodNote = d.reason;
  }
  rows.push({
    kind: 'boletim',
    name: b.name,
    osmName: d.ok ? d.area.name : null,
    confidence: d.ok ? d.confidence : null,
    reason: d.reason,
  });
}
const errors = await writeCatalogFile(
  path('salvador.json'),
  prev,
  next,
  'auto',
);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

// Praias de referência (a posição vem da geometria da praia no OSM).
const refFile = path('reference-beaches.json');
const refs = JSON.parse(await readFile(refFile, 'utf8')) as ReferenceFile;
for (const r of refs.beaches) {
  const d = decideReferenceNeighborhood({ lat: r.lat, lng: r.lng }, areas);
  if (d.ok) {
    r.neighborhood = d.area.name;
    r.neighborhoodSource = polygonSource(d, today);
    r.neighborhoodNote = null;
  } else {
    r.neighborhood = null;
    r.neighborhoodSource = null;
    r.neighborhoodNote = d.reason;
  }
  rows.push({
    kind: 'referência',
    name: r.name,
    osmName: d.ok ? d.area.name : null,
    confidence: d.ok ? d.confidence : null,
    reason: d.reason,
  });
}
await writeFile(refFile, `${JSON.stringify(refs, null, 2)}\n`, 'utf8');

// Relatório.
let names: Record<string, string> = {};
try {
  names = JSON.parse(await readFile(path('neighborhood-names.json'), 'utf8'));
} catch {
  // sem tabela de nomes
}
const filled = rows.filter((r) => r.osmName);
const empty = rows.filter((r) => !r.osmName);
const count = (kind: Row['kind']) =>
  `${rows.filter((r) => r.kind === kind && r.osmName).length} com bairro, ${rows.filter((r) => r.kind === kind && !r.osmName).length} sem`;
console.log(
  `## Resumo\nBoletim (automático): ${count('boletim')}\nConferidos à mão: ${rows.filter((r) => r.kind === 'conferido').length}\nReferência: ${count('referência')}\n`,
);

console.log('## Sem bairro (motivo)');
for (const r of empty) console.log(`- [${r.kind}] ${r.name}: ${r.reason}`);

console.log('\n## Tabela praia -> bairro (nome no OSM -> exibido)');
for (const r of filled) {
  const shown = displayNeighborhood(r.osmName!, names);
  console.log(
    `| ${r.kind} | ${r.name} | ${r.osmName}${shown !== r.osmName ? ` -> ${shown}` : ''} | ${r.confidence ?? '-'} |`,
  );
}

const byName = new Map<string, { b: number; r: number }>();
for (const r of filled) {
  const cur = byName.get(r.osmName!) ?? { b: 0, r: 0 };
  if (r.kind === 'referência') cur.r += 1;
  else cur.b += 1;
  byName.set(r.osmName!, cur);
}
console.log('\n## Nomes de bairro distintos (como no OSM) e nº de praias');
for (const [n, c] of [...byName].sort((a, b) =>
  a[0].localeCompare(b[0], 'pt-BR'),
))
  console.log(`- ${n}: ${c.b + c.r} (${c.b} do boletim, ${c.r} de referência)`);

const unused = [...new Set(areas.map((x) => x.name))]
  .filter((n) => !byName.has(n))
  .sort((x, y) => x.localeCompare(y, 'pt-BR'));
console.log(
  `\n## Demais polígonos de bairro do OSM (0 praias): ${unused.length}\n${unused.join(' | ')}`,
);

const inputs = await loadSalvadorInputs();
const site = buildSiteModel(inputs.bulletins, inputs.catalog, {
  excluded: NOT_BEACHES,
  references: inputs.references,
  referenceExclude: inputs.referenceExclude,
  aliases: inputs.aliases,
  neighborhoodNames: inputs.neighborhoodNames,
});
const hoods = suggestNeighborhoods(site.beaches);
console.log(`\n## Sugestões da busca em produção (${hoods.length})`);
console.log(hoods.join(' | '));
