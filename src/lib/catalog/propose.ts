import { normalizeBeachName } from '../rules/group.ts';
import type { OsmSource } from './types.ts';
import { SALVADOR_BOUNDS } from './validate-catalog.ts';

/** Campos do Nominatim (`format=jsonv2&addressdetails=1`) que usamos. */
export interface NominatimResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  /** Nome do próprio elemento (sem endereço). */
  name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
}

/** Elemento do Overpass (`out center tags`). */
export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export type Decision =
  | {
      ok: true;
      lat: number;
      lng: number;
      neighborhood: string | null;
      source: OsmSource;
    }
  | { ok: false; reason: string };

const inSalvador = (lat: number, lng: number) =>
  lat >= SALVADOR_BOUNDS.lat[0] &&
  lat <= SALVADOR_BOUNDS.lat[1] &&
  lng >= SALVADOR_BOUNDS.lng[0] &&
  lng <= SALVADOR_BOUNDS.lng[1];

const isBeach = (r: NominatimResult) =>
  r.category === 'natural' && r.type === 'beach';

/** Bairro segundo o OSM, na ordem de preferência. */
export function neighborhoodOf(r: NominatimResult): string | null {
  const a = r.address ?? {};
  return a.suburb ?? a.neighbourhood ?? a.city_district ?? a.quarter ?? null;
}

/**
 * Etapa 1. Decide se a resposta do Nominatim para uma praia é aceitável. Só aceita
 * quando há exatamente um candidato que é praia e está dentro de Salvador; senão
 * descarta com o motivo (nunca escolhe entre candidatas). Função pura.
 */
export function decideCandidate(
  results: readonly NominatimResult[],
  query: string,
  today: string,
  beachName: string,
): Decision {
  if (results.length === 0) return { ok: false, reason: 'não encontrada' };
  const found = results.filter(isBeach);
  if (found.length === 0) {
    return { ok: false, reason: 'o OSM não traz uma praia com esse nome' };
  }
  // Coerência: o nome do elemento precisa corresponder ao do boletim.
  const beaches = found.filter((r) => namesMatch(beachName, elementName(r)));
  if (beaches.length === 0) {
    return { ok: false, reason: 'a praia achada tem outro nome' };
  }
  const inside = beaches.filter((r) =>
    inSalvador(Number(r.lat), Number(r.lon)),
  );
  if (inside.length === 0)
    return { ok: false, reason: 'posição fora de Salvador' };
  if (inside.length > 1) {
    return { ok: false, reason: `mais de uma candidata (${inside.length})` };
  }
  const r = inside[0]!;
  return {
    ok: true,
    lat: Number(r.lat),
    lng: Number(r.lon),
    neighborhood: neighborhoodOf(r),
    source: {
      provider: 'osm',
      method: 'name',
      confidence: 'high',
      query,
      osmType: r.osm_type,
      osmId: r.osm_id,
      displayName: r.display_name,
      fetchedAt: today,
    },
  };
}

const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das']);

/** Palavras do nome sem caixa, acento, prefixo "Praia" nem artigos (de/do/da...). */
export function nameTokens(name: string): string[] {
  const words = normalizeBeachName(name)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (words[0] === 'praia') words.shift();
  return words.filter((w) => !STOPWORDS.has(w));
}

/** Nome sem o prefixo "Praia (de/do/da)", com a grafia do boletim. */
const stripPraia = (name: string) =>
  name.replace(/^praia\s+(d[aeo]s?\s+)?/i, '').trim();

/** Etapa 1: consultas em ordem (nome puro e variações com "Praia"), sempre limitadas a Salvador. */
export function queriesFor(beachName: string): string[] {
  const core = stripPraia(beachName);
  const names = [
    beachName,
    `Praia do ${core}`,
    `Praia da ${core}`,
    `Praia de ${core}`,
    core,
  ];
  return [...new Set(names)].map((n) => `${n}, Salvador, Bahia`);
}

const isSubsequence = (small: string[], big: string[]) => {
  if (small.length === 0 || small.length > big.length) return false;
  for (let i = 0; i + small.length <= big.length; i++) {
    if (small.every((w, j) => big[i + j] === w)) return true;
  }
  return false;
};

/**
 * Nomes coerentes: o do boletim é igual ao do OSM, ou está contido nele como palavras
 * inteiras seguidas (o OSM pode ter palavras a mais, ex.: "Pituaçu" e "Praia de Pituaçu
 * Norte"). O contrário não vale: "Praia da Barra" não é o "Farol da Barra".
 */
export function namesMatch(boletim: string, osm: string): boolean {
  return isSubsequence(nameTokens(boletim), nameTokens(osm));
}

/** Nome do elemento do Nominatim: o próprio `name` ou o primeiro trecho do endereço. */
function elementName(r: NominatimResult): string {
  return r.name ?? r.display_name.split(',')[0]!;
}

/** Consulta do Overpass (uma só): praias, corpos d'água e marinas com nome na caixa de Salvador. */
export function overpassQuery(): string {
  const [south, north] = SALVADOR_BOUNDS.lat;
  const [west, east] = SALVADOR_BOUNDS.lng;
  const bbox = `${south},${west},${north},${east}`;
  return [
    '[out:json][timeout:90];',
    '(',
    `  nwr["natural"="beach"]["name"](${bbox});`,
    `  nwr["natural"="water"]["name"](${bbox});`,
    `  nwr["leisure"="marina"]["name"](${bbox});`,
    ');',
    'out center tags;',
  ].join('\n');
}

const OVERPASS_LABEL = 'overpass: natural=beach|water, leisure=marina';

/**
 * Etapa 2. Compara o nome do boletim com os elementos do Overpass. Aceita só com
 * exatamente um candidato coerente dentro de Salvador. Bairro fica null (vem do
 * reverse, fora desta função). Função pura.
 */
export function matchOverpass(
  elements: readonly OverpassElement[],
  beachName: string,
  today: string,
): Decision {
  const named = elements.filter((e) => e.tags?.name);
  const matching = named.filter((e) => namesMatch(beachName, e.tags!.name!));
  if (matching.length === 0) {
    return { ok: false, reason: 'nenhuma correspondência de nome' };
  }
  const located = matching.flatMap((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    return lat === undefined || lon === undefined || !inSalvador(lat, lon)
      ? []
      : [{ e, lat, lon }];
  });
  if (located.length === 0) {
    return { ok: false, reason: 'posição fora de Salvador' };
  }
  if (located.length > 1) {
    return { ok: false, reason: `mais de uma candidata (${located.length})` };
  }
  const { e, lat, lon } = located[0]!;
  return {
    ok: true,
    lat,
    lng: lon,
    neighborhood: null,
    source: {
      provider: 'osm',
      method: 'overpass',
      confidence: 'medium',
      query: OVERPASS_LABEL,
      osmType: e.type,
      osmId: e.id,
      displayName: e.tags!.name!,
      fetchedAt: today,
    },
  };
}

/**
 * Etapa 3. Trecho útil da descrição do local do boletim (tira a abertura "Em frente
 * à…", "Ao lado de…" e corta na primeira vírgula ou ponto). null se sobrar pouco.
 */
export function descriptionClause(
  location: string | null | undefined,
): string | null {
  if (!location) return null;
  const clause = location
    .split(/[,;]/)[0]!
    .replace(/\.\s*$/, '')
    .replace(
      /^\s*(em frente|ao lado|próximo|perto|na altura|defronte|na saída)\s+(d?[aàeo]s?\s+|ao\s+|aos\s+|às\s+)?/i,
      '',
    )
    .trim();
  // Precisa citar um nome próprio (palavra com maiúscula depois da primeira): "quadra de esportes" é genérica demais.
  const words = clause.split(/\s+/).slice(1);
  const hasProperName = words.some((w) => /^\p{Lu}/u.test(w));
  return clause.length >= 4 && hasProperName ? clause : null;
}

export function descriptionQuery(
  location: string | null | undefined,
): string | null {
  const clause = descriptionClause(location);
  return clause ? `${clause}, Salvador, Bahia` : null;
}

/**
 * Etapa 3 (último recurso). Aceita só com exatamente um resultado dentro de
 * Salvador. Baixa confiança. Função pura.
 */
export function decideDescription(
  results: readonly NominatimResult[],
  query: string,
  today: string,
  clause: string,
): Decision {
  if (results.length === 0) return { ok: false, reason: 'não encontrada' };
  // Coerência: o nome do resultado precisa conter o trecho citado na descrição.
  const named = results.filter((r) => namesMatch(clause, elementName(r)));
  if (named.length === 0) {
    return { ok: false, reason: 'nenhum resultado com o nome citado' };
  }
  const inside = named.filter((r) => inSalvador(Number(r.lat), Number(r.lon)));
  if (inside.length === 0)
    return { ok: false, reason: 'posição fora de Salvador' };
  if (inside.length > 1) {
    return { ok: false, reason: `mais de uma candidata (${inside.length})` };
  }
  const r = inside[0]!;
  return {
    ok: true,
    lat: Number(r.lat),
    lng: Number(r.lon),
    neighborhood: neighborhoodOf(r),
    source: {
      provider: 'osm',
      method: 'description',
      confidence: 'low',
      query,
      osmType: r.osm_type,
      osmId: r.osm_id,
      displayName: r.display_name,
      fetchedAt: today,
    },
  };
}

/** Acesso à rede, injetado (o script usa Nominatim/Overpass com cache; os testes usam dados à mão). */
export interface ProposalDeps {
  search(query: string): Promise<NominatimResult[]>;
  overpass(): Promise<OverpassElement[]>;
  reverse(lat: number, lng: number): Promise<NominatimResult | null>;
  today: string;
}

export interface ProposedPoint {
  code: string;
  lat: number;
  lng: number;
  source: OsmSource;
}

export interface Resolution {
  points: ProposedPoint[];
  neighborhood: string | null;
  neighborhoodSource: OsmSource | null;
  /** Motivo por etapa, quando algo ficou sem proposta. */
  note: string | null;
}

const uniq = (xs: string[]) => [...new Set(xs)].join(' / ');

/**
 * Resolve as posições de uma praia: nome (1) → Overpass (2) → descrição do local (3).
 * Para na primeira etapa que aceitar; a 3 só roda se a 1 e a 2 falharem e vale por
 * ponto. Nunca marca nada como verificado. Os pontos recebidos são os sem posição.
 */
export async function resolveBeach(
  name: string,
  points: readonly { code: string; location: string | null }[],
  deps: ProposalDeps,
): Promise<Resolution> {
  const { today } = deps;
  const apply = (d: Extract<Decision, { ok: true }>): Resolution => ({
    points: points.map((p) => ({
      code: p.code,
      lat: d.lat,
      lng: d.lng,
      source: d.source,
    })),
    neighborhood: d.neighborhood,
    neighborhoodSource: d.neighborhood ? d.source : null,
    note: null,
  });

  const reasons: string[] = [];

  // Etapa 1: variações do nome.
  const r1: string[] = [];
  for (const query of queriesFor(name)) {
    const d = decideCandidate(await deps.search(query), query, today, name);
    if (d.ok) return apply(d);
    r1.push(d.reason);
  }
  reasons.push(`nome: ${uniq(r1)}`);

  // Etapa 2: lista do Overpass.
  const d2 = matchOverpass(await deps.overpass(), name, today);
  if (d2.ok) {
    const rev = await deps.reverse(d2.lat, d2.lng);
    return apply({ ...d2, neighborhood: rev ? neighborhoodOf(rev) : null });
  }
  reasons.push(`overpass: ${d2.reason}`);

  // Etapa 3: descrição do local, ponto a ponto.
  const found: ProposedPoint[] = [];
  const missed: string[] = [];
  const r3: string[] = [];
  let neighborhood: string | null = null;
  let neighborhoodSource: OsmSource | null = null;
  for (const p of points) {
    const clause = descriptionClause(p.location);
    if (!clause) {
      r3.push('sem nome próprio na descrição');
      missed.push(p.code);
      continue;
    }
    const query = `${clause}, Salvador, Bahia`;
    const d = decideDescription(await deps.search(query), query, today, clause);
    if (!d.ok) {
      r3.push(d.reason);
      missed.push(p.code);
      continue;
    }
    found.push({ code: p.code, lat: d.lat, lng: d.lng, source: d.source });
    if (!neighborhood && d.neighborhood) {
      neighborhood = d.neighborhood;
      neighborhoodSource = d.source;
    }
  }
  if (missed.length > 0) {
    reasons.push(`descrição (${missed.join(', ')}): ${uniq(r3)}`);
  }
  return {
    points: found,
    neighborhood,
    neighborhoodSource,
    note: reasons.join('; '),
  };
}
