import { normalizeBeachName } from '../rules/group.ts';
import {
  assembleRings,
  inBoundary,
  type Boundary,
  type LatLng,
} from './geo.ts';
import type { GeomElement } from './placement.ts';
import type { CatalogPoint, CatalogSource, PolygonSource } from './types.ts';

// Bairro por ponto-em-polígono (só OpenStreetMap). Funções puras: o script
// `npm run catalog:neighborhoods` só baixa os polígonos e grava o resultado.

/** Polígono de bairro do OSM (relação `boundary=administrative`, `admin_level=10`). */
export interface NeighborhoodArea {
  osmId: number;
  /** Nome no OSM, sem a tabela de nomes. */
  name: string;
  boundary: Boundary;
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

/** Polígonos de bairro a partir dos elementos do Overpass. Ignora o que não for nível 10 ou não tiver nome/anel. */
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
    const boundary: Boundary = {
      outer: assembleRings(ways('outer')),
      inner: assembleRings(ways('inner')),
    };
    return boundary.outer.length > 0 ? [{ osmId: el.id, name, boundary }] : [];
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

/**
 * Decide o bairro da praia pelos pontos de alta confiança: cada ponto vota no polígono que o
 * contém; vence o bairro mais votado. Empate ou nenhum voto = não preenche (com o motivo).
 * `skipped` lista os pontos que ficaram de fora (níveis c, d, e ou sem posição), para o motivo.
 */
export function decideNeighborhood(
  points: readonly NeighborhoodPoint[],
  skipped: readonly { label: string; skipped: string }[],
  areas: readonly NeighborhoodArea[],
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
  let outside = 0;
  for (const p of trusted) {
    const hit = areasAt(p, areas);
    if (hit.length !== 1) {
      outside += 1; // fora de todo polígono, ou em mais de um (dado ambíguo): não vota
      continue;
    }
    const cur = votes.get(hit[0]!.osmId) ?? { area: hit[0]!, n: 0 };
    cur.n += 1;
    votes.set(hit[0]!.osmId, cur);
  }
  if (votes.size === 0) {
    return {
      ok: false,
      reason: `nenhum dos ${plural(trusted.length, 'ponto', 'pontos')} de alta confiança cai em um polígono de bairro do OSM`,
    };
  }
  const ranked = [...votes.values()].sort((a, b) => b.n - a.n);
  const [first, second] = ranked;
  if (second && second.n === first!.n) {
    const tied = ranked
      .filter((r) => r.n === first!.n)
      .map((r) => r.area.name)
      .join(' e ');
    return {
      ok: false,
      reason: `empate entre ${tied} (${plural(first!.n, 'ponto', 'pontos')} cada)`,
    };
  }
  const win = first!;
  const allTrusted = skipped.length === 0 && points.every((p) => p.trusted);
  const unanimous = win.n === trusted.length && outside === 0;
  return {
    ok: true,
    area: win.area,
    confidence: allTrusted && unanimous ? 'high' : 'medium',
    reason: `${win.n} de ${plural(trusted.length, 'ponto', 'pontos')} de nível g, a ou b dentro do polígono${skipped.length > 0 ? `; ${plural(skipped.length, 'ponto ignorado', 'pontos ignorados')} (${skipped.map((s) => `${s.label}: ${s.skipped}`).join('; ')})` : ''}`,
  };
}

/** Bairro de uma praia de referência: a posição vem da própria geometria da praia no OSM. */
export function decideReferenceNeighborhood(
  position: LatLng,
  areas: readonly NeighborhoodArea[],
): NeighborhoodDecision {
  const hit = areasAt(position, areas);
  if (hit.length === 0)
    return {
      ok: false,
      reason: 'a posição da praia não cai em nenhum polígono de bairro do OSM',
    };
  if (hit.length > 1)
    return {
      ok: false,
      reason: `a posição cai em mais de um polígono: ${hit.map((a) => a.name).join(' e ')}`,
    };
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
