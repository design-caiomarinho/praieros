import { osmSearchName, type OsmNameHints } from './osm-hints.ts';
import {
  namesMatch,
  decideDescription,
  descriptionClause,
  descriptionQuery,
} from './propose.ts';
import type { NominatimResult, OverpassElement } from './propose.ts';
import {
  distanceM,
  distanceToGeometryM,
  assembleRings,
  inBoundary,
  lengthM,
  pointAlong,
  spineOf,
  type Boundary,
  type Geometry,
  type LatLng,
  type Line,
} from './geo.ts';
import type {
  AutoSource,
  Catalog,
  CatalogEntry,
  CatalogPoint,
  Check,
  PointChecks,
} from './types.ts';
import { SALVADOR_BOUNDS } from './validate-catalog.ts';

// Posicionamento automático dos pontos do catálogo (sessão 8c). Tudo puro: o script
// `npm run catalog:place` só busca os dados no OpenStreetMap e grava o resultado.

/** Distância máxima de um ponto à geometria da praia. */
export const MAX_DISTANCE_TO_BEACH_M = 80;
/** Distância mínima entre pontos da mesma praia (escolha: pontos de coleta costumam ficar a dezenas de metros). */
export const MIN_SPACING_M = 40;
/** Passo da grade de reserva ao distribuir pontos ao longo da praia. */
const FALLBACK_STEP_M = 10;

/** Elemento do Overpass com `out geom` (geometria completa). */
export interface GeomElement extends OverpassElement {
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: string;
    role?: string;
    geometry?: { lat: number; lon: number }[];
  }[];
}

/** Consulta única do Overpass para a geometria das praias, lagoas e marinas (mesmos filtros da proposta). */
export function geometryQuery(): string {
  const [south, north] = SALVADOR_BOUNDS.lat;
  const [west, east] = SALVADOR_BOUNDS.lng;
  const bbox = `${south},${west},${north},${east}`;
  return [
    '[out:json][timeout:180];',
    '(',
    `  nwr["natural"="beach"]["name"](${bbox});`,
    `  nwr["natural"="water"]["name"](${bbox});`,
    `  nwr["leisure"="marina"]["name"](${bbox});`,
    ');',
    'out geom;',
  ].join('\n');
}

const toLatLng = (g: { lat: number; lon: number }) => ({
  lat: g.lat,
  lng: g.lon,
});
const isClosed = (pts: LatLng[]) =>
  pts.length >= 4 &&
  pts[0]!.lat === pts[pts.length - 1]!.lat &&
  pts[0]!.lng === pts[pts.length - 1]!.lng;

/** Linhas de um elemento do Overpass (way ou relation; nó sem linha). */
export function linesOf(el: GeomElement): Line[] {
  const raw: { lat: number; lon: number }[][] = [];
  if (el.type === 'way' && el.geometry) raw.push(el.geometry);
  if (el.type === 'relation') {
    for (const m of el.members ?? []) if (m.geometry) raw.push(m.geometry);
  }
  return raw
    .map((g) => g.map(toLatLng))
    .filter((pts) => pts.length >= 2)
    .map((pts) => ({ pts, closed: isClosed(pts) }));
}

/** Geometria da praia: união dos elementos cujo nome combina com o do boletim. Null se nenhum. */
export function geometryForBeach(
  beachName: string,
  elements: readonly GeomElement[],
  hints?: OsmNameHints,
): Geometry | null {
  const searchName = osmSearchName(beachName, hints);
  const lines: Line[] = [];
  const ids: string[] = [];
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name || !namesMatch(searchName, name)) continue;
    const l = linesOf(el);
    if (l.length === 0) continue;
    lines.push(...l);
    ids.push(`${el.type}/${el.id}`);
  }
  return lines.length > 0 ? { lines, ids } : null;
}

const ok = (meters: number | null = null): Check => ({
  status: 'pass',
  meters,
});
const bad = (meters: number | null = null): Check => ({
  status: 'fail',
  meters,
});
const na: Check = { status: 'n/a', meters: null };
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Verificações de uma posição contra a praia e os outros pontos dela. Função pura. */
export function computeChecks(
  pos: LatLng,
  others: readonly LatLng[],
  geometry: Geometry | null,
  boundary: Boundary,
): PointChecks {
  const inSalvador = inBoundary(pos, boundary) ? ok() : bad();
  let nearBeach = na;
  if (geometry) {
    const d = distanceToGeometryM(pos, geometry);
    nearBeach = d <= MAX_DISTANCE_TO_BEACH_M ? ok(round1(d)) : bad(round1(d));
  }
  let minSpacing = na;
  if (others.length > 0) {
    const d = Math.min(...others.map((o) => distanceM(pos, o)));
    minSpacing = d >= MIN_SPACING_M ? ok(round1(d)) : bad(round1(d));
  }
  return { inSalvador, nearBeach, minSpacing };
}

const hasPos = (p: { lat: number | null; lng: number | null }) =>
  p.lat !== null && p.lng !== null;

/**
 * Entra em produção: aprovado à mão (`verified`) ou posicionado automaticamente com todas as
 * verificações aplicáveis em `pass`. Dentro de Salvador e perto da geometria são obrigatórias
 * (a geometria nunca pode ser `n/a`); o espaçamento só é `n/a` quando o ponto é o único da praia.
 */
export function shownInProduction(p: CatalogPoint): boolean {
  if (!hasPos(p)) return false;
  if (p.verified) return true;
  if (p.source?.method !== 'auto-placed' || !p.checks) return false;
  const { inSalvador, nearBeach, minSpacing } = p.checks;
  return (
    inSalvador.status === 'pass' &&
    nearBeach.status === 'pass' &&
    minSpacing.status !== 'fail'
  );
}

export type PointState = 'verified' | 'auto' | 'pending' | 'unplaced';

/** Estado para a página de visão geral: verificado, automático (vai para produção), aguardando aprovação ou sem posição. */
export function pointState(p: CatalogPoint): PointState {
  if (!hasPos(p)) return 'unplaced';
  if (p.verified) return 'verified';
  return shownInProduction(p) ? 'auto' : 'pending';
}

export type PointPlan =
  | { kind: 'skip'; code: string }
  | {
      kind: 'placed';
      code: string;
      lat: number;
      lng: number;
      source: AutoSource;
      checks: PointChecks;
    }
  | { kind: 'unplaced'; code: string; note: string };

export interface PlanInput {
  beach: CatalogEntry;
  /** Descrição do local por código, do boletim mais recente. */
  locations: Readonly<Record<string, string | undefined>>;
  geometry: Geometry | null;
  boundary: Boundary;
  /** Resultados do Nominatim (limitado a Salvador) para a pista da descrição de cada código. */
  clueResults: Readonly<Record<string, readonly NominatimResult[]>>;
  today: string;
}

/** Aprovado ou manual: o posicionamento automático nunca mexe. */
export const isLocked = (p: CatalogPoint) =>
  p.verified || p.source?.method === 'manual';

/**
 * Decide a posição de cada ponto movível da praia. Com geometria: pista da descrição aceita só
 * a até 80 m dela; sem pista aceitável, distribui ao longo da geometria com espaçamento mínimo.
 * Sem geometria: só a descrição (baixa confiança, não vai para produção). Cada posição passa
 * por `computeChecks` e só é mantida se nenhuma verificação falhar.
 */
export function planBeach(input: PlanInput): PointPlan[] {
  const { beach, locations, geometry, boundary, clueResults, today } = input;
  const placed: LatLng[] = beach.points
    .filter((p) => isLocked(p) && hasPos(p))
    .map((p) => ({ lat: p.lat!, lng: p.lng! }));
  const plans = new Map<string, PointPlan>();
  const movable = beach.points.filter((p) => !isLocked(p));
  for (const p of beach.points)
    if (isLocked(p)) plans.set(p.code, { kind: 'skip', code: p.code });

  const finish = (code: string, pos: LatLng, source: AutoSource): boolean => {
    const checks = computeChecks(pos, placed, geometry, boundary);
    const failed = (Object.entries(checks) as [string, Check][]).filter(
      ([, c]) => c.status === 'fail',
    );
    if (failed.length > 0) return false;
    placed.push(pos);
    plans.set(code, { kind: 'placed', code, ...pos, source, checks });
    return true;
  };
  const src = (
    basis: AutoSource['basis'],
    query: string | null,
    r: NominatimResult | null,
  ): AutoSource => ({
    provider: 'auto',
    method: 'auto-placed',
    basis,
    confidence: basis === 'description' ? 'medium' : 'low',
    query,
    geometry: geometry?.ids ?? [],
    osm: r
      ? { type: r.osm_type, id: r.osm_id, displayName: r.display_name }
      : null,
    placedAt: today,
  });

  const pending: CatalogPoint[] = [];
  for (const p of movable) {
    const clause = descriptionClause(locations[p.code]);
    const query = descriptionQuery(locations[p.code]);
    const results = clueResults[p.code] ?? [];
    if (!clause || !query || results.length === 0) {
      pending.push(p);
      continue;
    }
    if (geometry) {
      // Pista aceita: dentro de Salvador, a até 80 m da geometria e a 40 m dos pontos já postos.
      const hit = results.find((r) =>
        finishable(
          { lat: Number(r.lat), lng: Number(r.lon) },
          placed,
          geometry,
          boundary,
        ),
      );
      if (
        hit &&
        finish(
          p.code,
          { lat: Number(hit.lat), lng: Number(hit.lon) },
          src('description', query, hit),
        )
      ) {
        continue;
      }
      pending.push(p);
    } else {
      const d = decideDescription(results, query, today, clause);
      const hit = d.ok
        ? results.find(
            (r) =>
              r.osm_id === d.source.osmId && r.osm_type === d.source.osmType,
          )
        : undefined;
      if (
        hit &&
        finish(
          p.code,
          { lat: Number(hit.lat), lng: Number(hit.lon) },
          src('description-only', query, hit),
        )
      ) {
        continue;
      }
      plans.set(p.code, {
        kind: 'unplaced',
        note: d.ok
          ? 'a posição pela descrição não passou nas verificações'
          : `sem geometria no OpenStreetMap e a descrição não bastou (${d.reason})`,
        code: p.code,
      });
    }
  }

  if (geometry) {
    const spine = spineOf(geometry);
    const len = spine ? lengthM(spine) : 0;
    // Candidatas: primeiro as posições em partes iguais; se alguma estiver ocupada (pista ou
    // ponto manual por perto), uma grade fina ao longo da linha serve de reserva.
    const slots = spine
      ? [
          ...pending.map((_, i) =>
            pointAlong(spine, (len * (i + 0.5)) / pending.length),
          ),
          ...Array.from(
            { length: Math.floor(len / FALLBACK_STEP_M) + 1 },
            (_, i) => pointAlong(spine, i * FALLBACK_STEP_M),
          ),
        ]
      : [];
    const used = new Set<number>();
    for (const p of pending) {
      const i = slots.findIndex(
        (s, k) => !used.has(k) && finishable(s, placed, geometry, boundary),
      );
      if (i >= 0 && finish(p.code, slots[i]!, src('spread', null, null))) {
        used.add(i);
      } else {
        plans.set(p.code, {
          kind: 'unplaced',
          code: p.code,
          note: spine
            ? `sem espaço na geometria da praia (${Math.round(len)} m) respeitando ${MIN_SPACING_M} m entre pontos`
            : 'geometria da praia sem linhas utilizáveis',
        });
      }
    }
  } else {
    for (const p of pending) {
      if (!plans.has(p.code)) {
        plans.set(p.code, {
          kind: 'unplaced',
          code: p.code,
          note: locations[p.code]
            ? 'sem geometria no OpenStreetMap e a descrição do local não cita um nome encontrável'
            : 'sem geometria no OpenStreetMap e sem descrição do local',
        });
      }
    }
  }
  // Segunda passada: as verificações de cada ponto contra a posição FINAL de todos os outros
  // (o primeiro ponto posto não conhecia os seguintes ao ser verificado).
  const finalPos = new Map<string, LatLng>();
  for (const p of beach.points) {
    const plan = plans.get(p.code)!;
    if (plan.kind === 'placed')
      finalPos.set(p.code, { lat: plan.lat, lng: plan.lng });
    else if (plan.kind === 'skip' && hasPos(p))
      finalPos.set(p.code, { lat: p.lat!, lng: p.lng! });
  }
  return beach.points.map((p) => {
    const plan = plans.get(p.code)!;
    if (plan.kind !== 'placed') return plan;
    const others = [...finalPos]
      .filter(([c]) => c !== p.code)
      .map(([, v]) => v);
    const checks = computeChecks(
      { lat: plan.lat, lng: plan.lng },
      others,
      geometry,
      boundary,
    );
    if (Object.values(checks).some((c) => c.status === 'fail')) {
      return {
        kind: 'unplaced',
        code: p.code,
        note: 'não passou nas verificações finais',
      } as PointPlan;
    }
    return { ...plan, checks };
  });
}

/** Passaria nas três verificações (usado para escolher entre candidatas sem registrar nada). */
function finishable(
  pos: LatLng,
  placed: readonly LatLng[],
  geometry: Geometry | null,
  boundary: Boundary,
): boolean {
  const c = computeChecks(pos, placed, geometry, boundary);
  return (
    c.inSalvador.status !== 'fail' &&
    c.nearBeach.status !== 'fail' &&
    c.minSpacing.status !== 'fail'
  );
}

/** Aplica os planos ao catálogo (sem alterar o original). Guarda a proposta OSM substituída. */
export function applyPlans(
  catalog: Catalog,
  plans: ReadonlyMap<string, readonly PointPlan[]>,
): Catalog {
  return {
    ...catalog,
    beaches: catalog.beaches.map((b) => {
      const list = plans.get(b.name);
      if (!list) return b;
      return {
        ...b,
        points: b.points.map((p, i) => {
          const plan = list[i]!;
          if (plan.kind === 'skip') return p;
          const old = p.source;
          const keepOld =
            old?.provider === 'osm' &&
            !p.proposals.some((x) => JSON.stringify(x) === JSON.stringify(old));
          const proposals = keepOld ? [...p.proposals, old] : p.proposals;
          if (plan.kind === 'placed') {
            return {
              ...p,
              lat: plan.lat,
              lng: plan.lng,
              source: plan.source,
              proposals,
              checks: plan.checks,
              placementNote: null,
              verified: false,
            };
          }
          return {
            ...p,
            lat: null,
            lng: null,
            source: null,
            proposals,
            checks: null,
            placementNote: plan.note,
            verified: false,
          };
        }),
      };
    }),
  };
}

/** Consulta única do Overpass para o polígono administrativo de Salvador (mesma relação do limite do mapa). */
export const BOUNDARY_QUERY =
  '[out:json][timeout:180];\nrel(362362);\nout geom;';

/** Polígono de Salvador a partir da relação do OSM: junta os trechos `outer` e `inner` em anéis. */
export function boundaryFromRelation(el: GeomElement): Boundary {
  const ways = (role: string) =>
    (el.members ?? [])
      .filter((m) => m.type === 'way' && m.role === role && m.geometry)
      .map((m) => m.geometry!.map(toLatLng));
  return {
    outer: assembleRings(ways('outer')),
    inner: assembleRings(ways('inner')),
  };
}
