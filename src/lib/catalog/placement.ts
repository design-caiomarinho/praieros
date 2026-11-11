import { osmSearchName, type OsmNameHints } from './osm-hints.ts';
import { namesMatch, descriptionQuery } from './propose.ts';
import type { NominatimResult, OverpassElement } from './propose.ts';
import {
  distanceM,
  distanceToGeometryM,
  assembleRings,
  inBoundary,
  lengthM,
  nearestOnGeometry,
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
  boundary?: Boundary,
): Geometry | null {
  const searchName = osmSearchName(beachName, hints);
  const lines: Line[] = [];
  const ids: string[] = [];
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name || !namesMatch(searchName, name)) continue;
    const l = linesOf(el);
    if (l.length === 0) continue;
    // Homônimo fora de Salvador (ex.: Penha em Vera Cruz) não é a praia: só entra com algum ponto dentro.
    if (
      boundary &&
      !l.some((line) => line.pts.some((pt) => inBoundary(pt, boundary)))
    ) {
      continue;
    }
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
 * Entra em produção: aprovado à mão (`verified`) ou posicionado automaticamente
 * (`auto-placed`, em qualquer nível), sem exceção. Quanto menos exata a posição, mais claro o
 * aviso na ficha (`accuracyOf`). Ponto sem coordenadas nunca aparece.
 */
export function shownInProduction(p: CatalogPoint): boolean {
  if (!hasPos(p)) return false;
  return p.verified || p.source?.method === 'auto-placed';
}

/** Grau de aproximação mostrado na ficha. Verificado e manual não avisam. */
export type Accuracy = 'approximate' | 'very-approximate';

export function accuracyOf(p: CatalogPoint): Accuracy | null {
  if (p.verified || !hasPos(p) || p.source?.method !== 'auto-placed') {
    return null;
  }
  const level = p.source.level ?? 'g';
  return level === 'c' || level === 'd' || level === 'e'
    ? 'very-approximate'
    : 'approximate';
}

export type PointState =
  'verified' | 'auto' | 'very-approximate' | 'pending' | 'unplaced';

/** Estado para a visão geral: verificado, automático, muito aproximado, aguardando (posição de outra origem, não aprovada) ou sem posição. */
export function pointState(p: CatalogPoint): PointState {
  if (!hasPos(p)) return 'unplaced';
  if (p.verified) return 'verified';
  if (!shownInProduction(p)) return 'pending';
  return accuracyOf(p) === 'very-approximate' ? 'very-approximate' : 'auto';
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
 * Nível g: decide a posição de cada ponto movível de uma praia COM geometria no OSM (dentro de
 * Salvador). Pista da descrição aceita só a até 80 m dela; sem pista aceitável, distribui ao
 * longo da geometria com espaçamento mínimo. Sem geometria, os pontos ficam sem posição aqui e
 * seguem para os níveis a–e (`levels.ts`). Cada posição passa por `computeChecks`.
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
    basis: 'geometry-description' | 'geometry-spread',
    query: string | null,
    r: NominatimResult | null,
  ): AutoSource => ({
    provider: 'auto',
    method: 'auto-placed',
    level: 'g',
    basis,
    confidence: basis === 'geometry-description' ? 'medium' : 'low',
    reason:
      basis === 'geometry-description'
        ? 'pista da descrição a até 80 m da geometria da praia'
        : 'distribuído ao longo da geometria da praia',
    query,
    geometry: geometry?.ids ?? [],
    osm: r
      ? { type: r.osm_type, id: r.osm_id, displayName: r.display_name }
      : null,
    placedAt: today,
  });

  if (!geometry) {
    for (const p of movable) {
      plans.set(p.code, {
        kind: 'unplaced',
        code: p.code,
        note: 'nível g: nenhum elemento do OSM com o nome da praia dentro de Salvador',
      });
    }
  } else {
    const pending: CatalogPoint[] = [];
    for (const p of movable) {
      const query = descriptionQuery(locations[p.code]);
      const results = clueResults[p.code] ?? [];
      // É praia: a pista vai para o ponto mais próximo da geometria da praia (areia), não
      // fica na rua ou no prédio citado na descrição.
      const hit = results.find((r) =>
        finishable(snapToBeach(r, geometry), placed, geometry, boundary),
      );
      if (
        query &&
        hit &&
        finish(
          p.code,
          snapToBeach(hit, geometry),
          src('geometry-description', query, hit),
        )
      ) {
        continue;
      }
      pending.push(p);
    }

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
      if (
        i >= 0 &&
        finish(p.code, slots[i]!, src('geometry-spread', null, null))
      ) {
        used.add(i);
      } else {
        plans.set(p.code, {
          kind: 'unplaced',
          code: p.code,
          note: `nível g: ${whyNoSlot(slots, placed, geometry, boundary, len)}`,
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
        note: 'nível g: não passou nas verificações finais',
      } as PointPlan;
    }
    return { ...plan, checks };
  });
}

/** Resultado do Nominatim levado ao ponto mais próximo da geometria da praia (se já está a até 80 m dela). */
function snapToBeach(r: NominatimResult, geometry: Geometry): LatLng {
  const raw = { lat: Number(r.lat), lng: Number(r.lon) };
  if (distanceToGeometryM(raw, geometry) === 0) return raw; // já dentro da área da praia
  const near = nearestOnGeometry(raw, geometry);
  return near && near.dist <= MAX_DISTANCE_TO_BEACH_M ? near.point : raw;
}

/** Diz qual verificação realmente impediu todas as candidatas (e não "sem espaço" por padrão). */
export function whyNoSlot(
  slots: readonly LatLng[],
  placed: readonly LatLng[],
  geometry: Geometry | null,
  boundary: Boundary,
  lengthMeters: number,
): string {
  if (slots.length === 0) return 'geometria da praia sem linhas utilizáveis';
  const cs = slots.map((s) => computeChecks(s, placed, geometry, boundary));
  if (cs.every((c) => c.inSalvador.status === 'fail')) {
    return 'a geometria da praia está fora do polígono de Salvador';
  }
  if (cs.every((c) => c.nearBeach.status === 'fail')) {
    return `a posição fica a mais de ${MAX_DISTANCE_TO_BEACH_M} m da geometria da praia`;
  }
  return `sem espaço na geometria da praia (${Math.round(lengthMeters)} m) respeitando ${MIN_SPACING_M} m entre pontos`;
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
