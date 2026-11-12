import { normalizeBeachName } from '../rules/group.ts';
import {
  assembleRings,
  distanceM,
  distanceToSegmentM,
  inBoundary,
  type Boundary,
  type LatLng,
} from './geo.ts';
import type { GeomElement } from './placement.ts';
import type { CatalogPoint, CatalogSource, PolygonSource } from './types.ts';

// Bairro por ponto-em-polígono (só OpenStreetMap). Funções puras: o script
// `npm run catalog:neighborhoods` só baixa os polígonos e grava o resultado.

/** Vão máximo (m) que a montagem fecha com um trecho reto num contorno que não fecha no OSM. */
export const MAX_GAP_M = 150;
/** Tolerância (m): ponto fora de todo polígono pode usar o mais próximo se estiver a até aqui. */
export const TOLERANCE_M = 100;

/** Polígono de bairro do OSM (relação `boundary=administrative`, `admin_level=10`). */
export interface NeighborhoodArea {
  osmId: number;
  /** Nome no OSM, sem a tabela de nomes. */
  name: string;
  boundary: Boundary;
  /** Vãos do contorno fechados na montagem (`closeGaps`); ausente = o OSM já fechava. */
  gapsClosed?: number;
}

/** Consulta do Overpass: todos os bairros (nível 10) dentro da caixa de Salvador, com geometria. */
export function neighborhoodAreasQuery(
  south: number,
  west: number,
  north: number,
  east: number,
): string {
  return `[out:json][timeout:180];\nrel["boundary"="administrative"]["admin_level"="10"](${south},${west},${north},${east});\nout geom;`;
}

const toLatLng = (g: { lat: number; lon: number }): LatLng => ({
  lat: g.lat,
  lng: g.lon,
});

const pointKey = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Alguns contornos do OSM não fecham (vão de dezenas de metros entre dois trechos, ex.: Boca do
 * Rio). Une as pontas soltas mais próximas, de até `maxGapM`, com um trecho reto. Vão maior que o
 * limite ou ponta sem par ficam como estão (o anel não fecha e o polígono é descartado).
 */
export function closeGaps(
  ways: readonly LatLng[][],
  maxGapM = MAX_GAP_M,
): { ways: LatLng[][]; closed: number } {
  const ends = new Map<string, { p: LatLng; n: number }>();
  for (const w of ways) {
    if (w.length < 2) continue;
    for (const p of [w[0]!, w[w.length - 1]!]) {
      const k = pointKey(p);
      ends.set(k, { p, n: (ends.get(k)?.n ?? 0) + 1 });
    }
  }
  const loose = [...ends.values()].filter((e) => e.n % 2 === 1).map((e) => e.p);
  const bridges: LatLng[][] = [];
  while (loose.length >= 2) {
    let best: { i: number; j: number; d: number } | null = null;
    for (let i = 0; i < loose.length; i++)
      for (let j = i + 1; j < loose.length; j++) {
        const d = distanceM(loose[i]!, loose[j]!);
        if (!best || d < best.d) best = { i, j, d };
      }
    if (!best || best.d > maxGapM) break;
    bridges.push([loose[best.i]!, loose[best.j]!]);
    loose.splice(best.j, 1);
    loose.splice(best.i, 1);
  }
  return {
    ways: [...ways.map((w) => w.slice()), ...bridges],
    closed: bridges.length,
  };
}

/**
 * Polígonos de bairro a partir dos elementos do Overpass. Contornos com vão de até `MAX_GAP_M`
 * são fechados (`gapsClosed`). Ignora o que não for nível 10 ou não tiver nome/anel.
 */
export function areasFromElements(
  elements: readonly GeomElement[],
): NeighborhoodArea[] {
  return elements.flatMap((el) => {
    const name = el.tags?.name?.trim();
    if (el.type !== 'relation' || el.tags?.admin_level !== '10' || !name)
      return [];
    const ways = (role: string) =>
      (el.members ?? [])
        .filter((m) => m.type === 'way' && m.role === role && m.geometry)
        .map((m) => m.geometry!.map(toLatLng));
    const outerWays = ways('outer');
    // Contorno que já fecha por inteiro não é mexido; só o que sobra solto ganha o fecho.
    let outer = assembleRings(outerWays);
    let gapsClosed = 0;
    const fixed = closeGaps(outerWays);
    if (fixed.closed > 0) {
      const rings = assembleRings(fixed.ways);
      if (rings.length >= outer.length) {
        outer = rings;
        gapsClosed = fixed.closed;
      }
    }
    const boundary: Boundary = { outer, inner: assembleRings(ways('inner')) };
    return outer.length > 0
      ? [
          {
            osmId: el.id,
            name,
            boundary,
            ...(gapsClosed > 0 ? { gapsClosed } : {}),
          },
        ]
      : [];
  });
}

/** Bairros (polígonos) que contêm a posição. Normalmente 0 ou 1. */
export function areasAt(
  p: LatLng,
  areas: readonly NeighborhoodArea[],
): NeighborhoodArea[] {
  return areas.filter((a) => inBoundary(p, a.boundary));
}

/** Ponto de uma praia usado na decisão. `trusted` = posição de alta confiança. */
export interface NeighborhoodPoint {
  label: string;
  lat: number;
  lng: number;
  trusted: boolean;
}

/**
 * Ponto de coleta com posição de alta confiança: aprovado à mão ou automático de nível g, a ou b
 * (sem nível = g). Níveis c, d e e (posição muito aproximada) e propostas soltas do OSM não valem:
 * um bairro errado seria erro factual.
 */
export function neighborhoodPointOf(
  p: CatalogPoint,
): NeighborhoodPoint | { label: string; skipped: string } {
  const label = p.code;
  if (p.lat === null || p.lng === null)
    return { label, skipped: 'sem posição' };
  const s = p.source;
  if (s?.method === 'manual')
    return { label, lat: p.lat, lng: p.lng, trusted: true };
  if (s?.method === 'auto-placed') {
    const level = s.level ?? 'g';
    return level === 'g' || level === 'a' || level === 'b'
      ? { label, lat: p.lat, lng: p.lng, trusted: true }
      : { label, skipped: `nível ${level}` };
  }
  return { label, skipped: 'posição só proposta pelo OSM' };
}

export type NeighborhoodDecision =
  | {
      ok: true;
      area: NeighborhoodArea;
      confidence: PolygonSource['confidence'];
      reason: string;
    }
  | { ok: false; reason: string };

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Distância (m) da posição ao contorno externo do polígono; 0 se estiver dentro. */
export function distanceToArea(p: LatLng, a: NeighborhoodArea): number {
  if (inBoundary(p, a.boundary)) return 0;
  let d = Infinity;
  for (const ring of a.boundary.outer)
    for (let i = 0; i + 1 < ring.length; i++)
      d = Math.min(d, distanceToSegmentM(p, ring[i]!, ring[i + 1]!));
  return d;
}

/**
 * Tolerância por distância: para posição que nenhum polígono contém, o polígono mais próximo vale
 * se estiver a até `TOLERANCE_M` e o segundo estiver mais de `TOLERANCE_M` além do primeiro
 * (sem empate). Senão, null.
 */
export function nearestWithinTolerance(
  p: LatLng,
  areas: readonly NeighborhoodArea[],
): { area: NeighborhoodArea; meters: number } | null {
  const ranked = areas
    .map((area) => ({ area, meters: distanceToArea(p, area) }))
    .sort((a, b) => a.meters - b.meters);
  const [first, second] = ranked;
  if (!first || first.meters > TOLERANCE_M) return null;
  if (second && second.meters <= first.meters + TOLERANCE_M) return null;
  return first;
}

/**
 * Decide o bairro da praia pelos pontos de alta confiança: cada ponto vota no polígono que o
 * contém (ou, se nenhum contém, no único polígono a até 100 m); vence o mais votado. Empate ou
 * nenhum voto = não preenche (com o motivo). Só no empate entre dois polígonos, se um deles tem o
 * nome da praia (`beachName`), ele desempata; o nome nunca contraria a posição.
 * `skipped` lista os pontos que ficaram de fora (níveis c, d, e ou sem posição), para o motivo.
 */
export function decideNeighborhood(
  points: readonly NeighborhoodPoint[],
  skipped: readonly { label: string; skipped: string }[],
  areas: readonly NeighborhoodArea[],
  beachName?: string,
): NeighborhoodDecision {
  const trusted = points.filter((p) => p.trusted);
  if (trusted.length === 0) {
    const why = skipped.map((s) => `${s.label}: ${s.skipped}`).join('; ');
    return {
      ok: false,
      reason: `nenhum ponto de nível g, a ou b (posição muito aproximada ou ausente)${why ? ` (${why})` : ''}`,
    };
  }
  const votes = new Map<number, { area: NeighborhoodArea; n: number }>();
  const tolerated: string[] = [];
  let outside = 0;
  const vote = (area: NeighborhoodArea) => {
    const cur = votes.get(area.osmId) ?? { area, n: 0 };
    cur.n += 1;
    votes.set(area.osmId, cur);
  };
  for (const p of trusted) {
    const hit = areasAt(p, areas);
    if (hit.length === 1) {
      vote(hit[0]!);
    } else if (hit.length === 0) {
      const near = nearestWithinTolerance(p, areas);
      if (near) {
        vote(near.area);
        tolerated.push(
          `${p.label} a ${Math.round(near.meters)} m do polígono ${near.area.name}, sem polígono que o contenha`,
        );
      } else outside += 1;
    } else {
      outside += 1; // em mais de um polígono (dado ambíguo): não vota
    }
  }
  if (votes.size === 0) {
    return {
      ok: false,
      reason: `nenhum dos ${plural(trusted.length, 'ponto', 'pontos')} de alta confiança cai em um polígono de bairro do OSM nem está a até ${TOLERANCE_M} m de um único polígono`,
    };
  }
  const ranked = [...votes.values()].sort((a, b) => b.n - a.n);
  const top = ranked.filter((r) => r.n === ranked[0]!.n);
  let win = ranked[0]!;
  let byName = false;
  if (top.length > 1) {
    const named = beachName
      ? top.filter(
          (r) =>
            normalizeBeachName(r.area.name) === normalizeBeachName(beachName),
        )
      : [];
    if (top.length === 2 && named.length === 1) {
      win = named[0]!;
      byName = true;
    } else {
      return {
        ok: false,
        reason: `empate entre ${top.map((r) => r.area.name).join(' e ')} (${plural(top[0]!.n, 'ponto', 'pontos')} cada)`,
      };
    }
  }
  const allTrusted = skipped.length === 0 && points.every((p) => p.trusted);
  const unanimous =
    win.n === trusted.length && outside === 0 && tolerated.length === 0;
  const notes = [
    ...(byName
      ? [
          `empate entre ${top.map((r) => r.area.name).join(' e ')} desempatado pelo nome da praia`,
        ]
      : []),
    ...(tolerated.length > 0
      ? [`tolerância de ${TOLERANCE_M} m: ${tolerated.join('; ')}`]
      : []),
    ...(skipped.length > 0
      ? [
          `${plural(skipped.length, 'ponto ignorado', 'pontos ignorados')} (${skipped.map((s) => `${s.label}: ${s.skipped}`).join('; ')})`,
        ]
      : []),
  ];
  return {
    ok: true,
    area: win.area,
    confidence: allTrusted && unanimous && !byName ? 'high' : 'medium',
    reason: [
      `${win.n} de ${plural(trusted.length, 'ponto', 'pontos')} de nível g, a ou b no polígono`,
      ...notes,
    ].join('; '),
  };
}

/** Bairro de uma praia de referência: a posição vem da própria geometria da praia no OSM. */
export function decideReferenceNeighborhood(
  position: LatLng,
  areas: readonly NeighborhoodArea[],
): NeighborhoodDecision {
  const hit = areasAt(position, areas);
  if (hit.length > 1)
    return {
      ok: false,
      reason: `a posição cai em mais de um polígono: ${hit.map((a) => a.name).join(' e ')}`,
    };
  if (hit.length === 0) {
    const near = nearestWithinTolerance(position, areas);
    if (!near)
      return {
        ok: false,
        reason: `a posição da praia não cai em nenhum polígono de bairro do OSM nem está a até ${TOLERANCE_M} m de um único polígono`,
      };
    return {
      ok: true,
      area: near.area,
      confidence: 'medium',
      reason: `tolerância de ${TOLERANCE_M} m: posição da praia a ${Math.round(near.meters)} m do polígono ${near.area.name}, sem polígono que a contenha`,
    };
  }
  return {
    ok: true,
    area: hit[0]!,
    confidence: 'high',
    reason: 'posição vinda da geometria da praia dentro do polígono',
  };
}

/** Fonte gravada para uma decisão positiva. */
export function polygonSource(
  d: Extract<NeighborhoodDecision, { ok: true }>,
  today: string,
): PolygonSource {
  return {
    provider: 'osm',
    method: 'polygon',
    confidence: d.confidence,
    osmType: 'relation',
    osmId: d.area.osmId,
    osmName: d.area.name,
    reason: d.reason,
    fetchedAt: today,
  };
}

/** Bairro automático (polígono) pode aparecer em produção; o `reverse` antigo não. */
export function isAutoNeighborhood(
  source: { method: string } | null | undefined,
): boolean {
  return source?.method === 'polygon';
}

/**
 * Tabela de nomes de bairro aprovada por Caio (`data/catalog/neighborhood-names.json`):
 * nome no OSM -> nome exibido. Aplicada só na leitura; o dado do OSM no catálogo não muda.
 * Só entra o que for aprovado (como a tabela de apelidos de praia). Sem diferenciar caixa nem acento.
 */
export type NeighborhoodNames = Readonly<Record<string, string>>;

export function displayNeighborhood(
  name: string,
  names: NeighborhoodNames = {},
): string {
  const key = normalizeBeachName(name);
  for (const [from, to] of Object.entries(names)) {
    if (normalizeBeachName(from) === key) return to;
  }
  return name;
}

const CONFIDENCE_PT = { high: 'alta', medium: 'média', low: 'baixa' } as const;

/**
 * Texto de origem do bairro para as páginas de conferência (só dev): método, confiança e motivo.
 * `shown` é o nome exibido depois da tabela de nomes, se for diferente do nome no OSM.
 */
export function neighborhoodOriginText(
  source: CatalogSource | null,
  opts: { verified?: boolean; note?: string | null } = {},
): string {
  if (opts.verified) return 'conferido à mão (prevalece sobre o automático)';
  if (!source)
    return opts.note
      ? `sem bairro: ${opts.note}`
      : 'sem bairro (o automático ainda não rodou)';
  if (source.method === 'polygon')
    return `polígono do OSM · confiança ${CONFIDENCE_PT[source.confidence]} · ${source.reason}`;
  if (source.method === 'manual') return 'manual';
  return 'consulta inversa do OSM (antigo, não conferido: só aparece em dev)';
}
