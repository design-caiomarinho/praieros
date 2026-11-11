import {
  assembleChains,
  centroid,
  distanceM,
  distanceToGeometryM,
  inBoundary,
  nearestOnGeometry,
  nearestOnPolyline,
  pointAlong,
  lengthM,
  type Boundary,
  type Geometry,
  type LatLng,
} from './geo.ts';
import { normalizeBeachName } from '../rules/group.ts';
import { osmSearchName, type OsmNameHints } from './osm-hints.ts';
import {
  isLocked,
  linesOf,
  MIN_SPACING_M,
  type GeomElement,
  type PointPlan,
} from './placement.ts';
import { namesMatch, queriesFor, type NominatimResult } from './propose.ts';
import type {
  AutoSource,
  Catalog,
  CatalogPoint,
  Check,
  PlacementLevel,
  PointChecks,
} from './types.ts';
import { SALVADOR_BOUNDS } from './validate-catalog.ts';

// Níveis de aproximação a–e (sessão 8d): para o ponto que o nível g (geometria) não posicionou,
// tenta do mais confiável ao menos e para no primeiro que passa nas verificações, para que
// nenhum ponto fique fora do mapa. Tudo puro: o script só busca os dados e grava o resultado.

/** Distância máxima de um ponto ao litoral do OSM. */
export const MAX_DISTANCE_TO_COAST_M = 150;
/** Referências da descrição que se afastam mais que isso entre si recusam o nível a. */
export const MAX_REFERENCE_SPREAD_M = 300;
/** Consistência mínima (|tau| de Kendall) da ordem do boletim com o litoral para usar o nível d. */
export const MIN_ORDER_TAU = 0.95;
/** Passo do deslocamento ao longo do litoral quando dois pontos da praia caem no mesmo lugar. */
export const SHIFT_STEP_M = 45;
const MAX_SHIFTS = 20;

/** Lagoa (ex.: Lagoa de Pituaçu) não é praia do mar: nunca é levada à costa nem posicionada por d e e. */
export const isLagoon = (beachName: string) =>
  /^lagoa\b/i.test(beachName.trim());

/** Consulta única do Overpass para o litoral (`natural=coastline`) na caixa de Salvador. */
export function coastQuery(): string {
  const [south, north] = SALVADOR_BOUNDS.lat;
  const [west, east] = SALVADOR_BOUNDS.lng;
  return `[out:json][timeout:180];\nway["natural"="coastline"](${south},${west},${north},${east});\nout geom;`;
}

export interface Coast {
  /** Todas as linhas do litoral (para distância e ponto mais próximo). */
  geometry: Geometry;
  /** Cadeia contínua mais longa: serve de régua para a ordem do boletim. */
  chain: LatLng[];
}

/** Litoral a partir dos elementos do Overpass. */
export function coastFromElements(elements: readonly GeomElement[]): Coast {
  const lines = elements
    .flatMap((e) => linesOf(e))
    .map((l) => ({ pts: l.pts, closed: false }));
  const chains = assembleChains(lines.map((l) => l.pts));
  return {
    geometry: { lines: chains.map((pts) => ({ pts, closed: false })), ids: [] },
    chain: chains[0] ?? [],
  };
}

// ---------- consultas ao Nominatim ----------

const ABBREVIATIONS = [
  'Prof',
  'Profa',
  'Dr',
  'Dra',
  'Av',
  'Cel',
  'Pe',
  'Sr',
  'Sra',
  'Eng',
  'Min',
  'Gov',
  'Pres',
  'Cap',
  'Gen',
  'Dep',
  'Pça',
  'Trav',
  'Est',
  'Rod',
  'Al',
];
const KEYWORDS =
  /^(rua|av|avenida|alameda|travessa|rodovia|largo|praça|hospital|hotel|colégio|escola|igreja|marina|restaurante|parque|mercado|forte|clube|shopping|edifício|condomínio|posto|barraca|bar|hospital)\b/i;
const LEADING =
  /^(em frente|ao lado|próximo|perto|atrás|junto|limítrofe|entre|na altura|defronte|na saída|fundo)\s+(?:(?:à|ao|aos|às|a|o|de|do|da|dos|das)\s+)?/i;

/**
 * Referências da descrição do local que dá para geocodificar (rua, hospital, hotel etc.), na
 * ordem em que aparecem. Trata abreviaturas ("Prof.", "Av."), parênteses e "entre X e Y". Ignora
 * trechos genéricos ("escada de acesso à praia", "quadra de esportes"). Função pura.
 */
export function descriptionReferences(
  location: string | null | undefined,
  max = 4,
): string[] {
  if (!location) return [];
  const abbr = new RegExp(`\\b(${ABBREVIATIONS.join('|')})\\.`, 'g');
  const text = location.replace(abbr, '$1\uE000');
  const inParens = [...text.matchAll(/\(([^)]*)\)/g)].map((m) =>
    m[1]!.replace(/^\s*(antigo|antiga|ex-?)\s+/i, ''),
  );
  const parts = text
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;]|\.\s+|\.\s*$/)
    .concat(inParens);
  const out: string[] = [];
  for (const raw of parts) {
    let part = raw
      .replace(/\uE000/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
    const between = /^entre\s/i.test(part);
    part = part.replace(LEADING, '').trim();
    const pieces = between ? part.split(/\s+e\s+(?=[ao]s?\s)/i) : [part];
    for (let piece of pieces) {
      piece = piece.replace(/^(?:[ao]s?|d[aeo]s?|n[ao]s?)\s+/i, '').trim();
      const words = piece.split(/\s+/);
      const proper = words.slice(1).some((w) => /^\p{Lu}/u.test(w));
      if (piece.length >= 4 && (KEYWORDS.test(piece) || proper)) {
        if (!out.includes(piece)) out.push(piece);
      }
    }
  }
  return out.slice(0, max);
}

const inCity = (q: string) => `${q}, Salvador, Bahia`;

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);
const words = (s: string) =>
  normalizeBeachName(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));

/**
 * O resultado do Nominatim é a referência citada? Todas as palavras significativas da
 * referência (com 4 letras ou mais, ou números) precisam estar no nome do resultado.
 * Evita aceitar "Igreja Nossa Senhora das Neves" (Ilha de Maré) para "igreja Nossa Senhora de
 * Santana" só por estar dentro de Salvador.
 */
export function referenceMatches(
  reference: string,
  resultName: string,
): boolean {
  const have = new Set(words(resultName));
  const need = words(reference).filter((w) => w.length >= 4 || /\d/.test(w));
  return need.length > 0 && need.every((w) => have.has(w));
}
export const referenceQueries = (location: string | null | undefined) =>
  descriptionReferences(location).map(inCity);

/** Nome da praia sem "Praia de/da/do". */
const core = (name: string) =>
  name.replace(/^praia\s+(d[aeo]s?\s+)?/i, '').trim();

/** Nível b: nome da praia (com a dica do OSM) em variações, sempre limitadas a Salvador. */
export const beachNameQueries = (name: string, hints?: OsmNameHints) =>
  queriesFor(osmSearchName(name, hints));

/** Bairro ou localidade citado na descrição ("no bairro de X"). */
export function localitiesIn(location: string | null | undefined): string[] {
  if (!location) return [];
  return [
    ...location.matchAll(
      /\b(?:bairro|localidade)\s+(?:d[aeo]s?\s+)?(\p{Lu}[\p{L}]*(?:\s+(?:d[aeo]s?\s+)?\p{Lu}[\p{L}]*)*)/gu,
    ),
  ].map((m) => m[1]!);
}

/** Nível c: localidades da descrição e o nome da praia lido como localidade. */
export function localityQueries(
  name: string,
  location: string | null | undefined,
  hints?: OsmNameHints,
): string[] {
  return [
    ...new Set([...localitiesIn(location), core(osmSearchName(name, hints))]),
  ].map(inCity);
}

// ---------- verificações dos níveis a–e ----------

const ok = (meters: number | null = null): Check => ({
  status: 'pass',
  meters,
});
const bad = (meters: number | null = null): Check => ({
  status: 'fail',
  meters,
});
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Verificações de uma posição nos níveis a–e: Salvador, litoral (150 m) e espaçamento (40 m). */
export function computeLevelChecks(
  pos: LatLng,
  others: readonly LatLng[],
  coast: Coast,
  boundary: Boundary,
  coastal = true,
): PointChecks {
  const d = distanceToGeometryM(pos, coast.geometry);
  const sp = others.length
    ? Math.min(...others.map((o) => distanceM(pos, o)))
    : null;
  return {
    inSalvador: inBoundary(pos, boundary) ? ok() : bad(),
    nearBeach: { status: 'n/a', meters: null },
    // Lagoa não é praia do mar: a regra do litoral não se aplica.
    nearCoast: !coastal
      ? { status: 'n/a', meters: null }
      : d <= MAX_DISTANCE_TO_COAST_M
        ? ok(round1(d))
        : bad(round1(d)),
    minSpacing:
      sp === null
        ? { status: 'n/a', meters: null }
        : sp >= MIN_SPACING_M
          ? ok(round1(sp))
          : bad(round1(sp)),
  };
}

const failed = (c: PointChecks) =>
  Object.values(c).some((x) => (x as Check).status === 'fail');

/** Frase do primeiro problema de uma posição, para o motivo do nível. */
function whyFailed(c: PointChecks): string {
  if (c.inSalvador.status === 'fail') return 'fora do polígono de Salvador';
  if (c.nearCoast?.status === 'fail') {
    return `a ${Math.round(c.nearCoast.meters ?? 0)} m do litoral (máximo ${MAX_DISTANCE_TO_COAST_M} m)`;
  }
  return `a ${Math.round(c.minSpacing.meters ?? 0)} m de outro ponto da praia (mínimo ${MIN_SPACING_M} m)`;
}

// ---------- ordem do boletim ----------

export interface OrderReport {
  /** Pontos usados na verificação (posicionados e a até 150 m da cadeia principal do litoral). */
  used: number;
  excluded: string[];
  /** Kendall tau entre a ordem do boletim e a posição ao longo do litoral (-1 a 1). */
  tau: number;
  /** Pares de códigos fora da ordem (considerando o sentido dominante). */
  inversions: [string, string][];
  /** |tau| ≥ MIN_ORDER_TAU. */
  consistent: boolean;
  /** 1 = a ordem do boletim segue o sentido da cadeia; -1 = o inverso. */
  direction: 1 | -1;
}

export interface Anchor {
  code: string;
  /** Posição na ordem do boletim (0, 1, 2…). */
  index: number;
  pos: LatLng;
}

/** A ordem do boletim acompanha o litoral? Função pura (Kendall tau sobre a cadeia principal). */
export function orderReport(
  anchors: readonly Anchor[],
  chain: readonly LatLng[],
): OrderReport {
  const used: (Anchor & { s: number })[] = [];
  const excluded: string[] = [];
  for (const a of [...anchors].sort((x, y) => x.index - y.index)) {
    const n = chain.length >= 2 ? nearestOnPolyline(a.pos, chain) : null;
    if (n && n.dist <= MAX_DISTANCE_TO_COAST_M) used.push({ ...a, s: n.s });
    else excluded.push(a.code);
  }
  let concordant = 0;
  let discordant = 0;
  const pairs: [string, string, number][] = [];
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      const d = used[j]!.s - used[i]!.s;
      if (d > 0) concordant++;
      else if (d < 0) discordant++;
      pairs.push([used[i]!.code, used[j]!.code, d]);
    }
  }
  const total = concordant + discordant;
  const tau = total === 0 ? 0 : (concordant - discordant) / total;
  const direction = tau >= 0 ? 1 : -1;
  return {
    used: used.length,
    excluded,
    tau: Math.round(tau * 1000) / 1000,
    inversions: pairs
      .filter(([, , d]) => d * direction < 0)
      .map(([a, b]) => [a, b] as [string, string]),
    consistent: Math.abs(tau) >= MIN_ORDER_TAU,
    direction,
  };
}

// ---------- planejamento ----------

export interface LevelsInput {
  /** Catálogo depois do nível g (`applyPlans`). */
  catalog: Catalog;
  /** Códigos na ordem do boletim (do PDF de Salvador). */
  order: readonly string[];
  /** Descrição do local por código. */
  locations: Readonly<Record<string, string | undefined>>;
  hints?: OsmNameHints;
  boundary: Boundary;
  coast: Coast;
  /** Resultados do Nominatim (limitado a Salvador) por consulta, já buscados. */
  lookup: Readonly<Record<string, readonly NominatimResult[]>>;
  today: string;
}

/** Posição aceita: `snapped` = metros movidos até a costa; `shifted` = metros deslocados ao longo dela. */
interface Settled {
  pos: LatLng;
  checks: PointChecks;
  shifted: number;
  snapped: number;
}

export interface LevelsResult {
  plans: Map<string, PointPlan[]>;
  order: OrderReport;
}

const elementName = (r: NominatimResult) =>
  r.name ?? r.display_name.split(',')[0]!;
const asPos = (r: NominatimResult): LatLng => ({
  lat: Number(r.lat),
  lng: Number(r.lon),
});

const CONFIDENCE: Record<PlacementLevel, AutoSource['confidence']> = {
  g: 'low',
  a: 'low',
  b: 'low',
  c: 'very-low',
  d: 'very-low',
  e: 'very-low',
};
const BASIS: Record<'a' | 'b' | 'c' | 'd' | 'e', AutoSource['basis']> = {
  a: 'references',
  b: 'beach-name',
  c: 'locality',
  d: 'order-interpolation',
  e: 'coast-snap',
};

/**
 * Posiciona os pontos que o nível g deixou sem posição. a, b e c por praia; d e e numa passada
 * global (dependem dos vizinhos). Cada nível só vale se a posição passar em `computeLevelChecks`.
 * Nunca mexe em ponto verificado ou manual. Nenhum ponto fica de fora se houver ao menos um
 * vizinho posicionado.
 */
export function planLevels(input: LevelsInput): LevelsResult {
  const { catalog, order, locations, hints, boundary, coast, lookup, today } =
    input;
  const indexOf = new Map(order.map((c, i) => [c, i]));
  const plans = new Map<string, PointPlan[]>();
  const positions = new Map<string, LatLng[]>(); // por praia: posições atuais
  const done = new Map<string, PointPlan>(); // por código
  for (const b of catalog.beaches) {
    positions.set(
      b.name,
      b.points
        .filter((p) => p.lat !== null && p.lng !== null)
        .map((p) => ({ lat: p.lat!, lng: p.lng! })),
    );
  }
  const todo = catalog.beaches.flatMap((b) =>
    b.points
      .filter((p) => !isLocked(p) && (p.lat === null || p.lng === null))
      .map((p) => ({ beach: b.name, point: p })),
  );
  const reasons = new Map<string, string[]>(
    todo.map((t) => [
      t.point.code,
      t.point.placementNote ? [t.point.placementNote] : [],
    ]),
  );
  const why = (code: string, text: string) => reasons.get(code)!.push(text);

  /** Aplica verificações; se só o espaçamento falha, desloca ao longo do litoral. */
  const settle = (beach: string, raw: LatLng): Settled | string => {
    const others = positions.get(beach)!;
    // É praia: a posição vai para o ponto mais próximo da linha da costa (areia e mar), não
    // fica em rua ou prédio. Só se o ponto achado já está a até 150 m do litoral.
    const coastal = !isLagoon(beach);
    const toCoast = coastal ? nearestOnGeometry(raw, coast.geometry) : null;
    const snap =
      toCoast && toCoast.dist <= MAX_DISTANCE_TO_COAST_M ? toCoast : null;
    const anchor = snap ? snap.point : raw;
    const snapped = snap ? Math.round(snap.dist) : 0;
    const first = computeLevelChecks(anchor, others, coast, boundary, coastal);
    if (!coastal && failed(first)) return whyFailed(first);
    if (!failed(first)) {
      return { pos: anchor, checks: first, shifted: 0, snapped };
    }
    const onlySpacing =
      first.inSalvador.status !== 'fail' &&
      first.nearCoast?.status !== 'fail' &&
      first.minSpacing.status === 'fail';
    if (!onlySpacing) return whyFailed(first);
    const near = nearestOnGeometry(anchor, coast.geometry);
    if (!near) return whyFailed(first);
    const line = coast.geometry.lines[near.line]!.pts;
    const total = lengthM(line);
    for (let k = 1; k <= MAX_SHIFTS; k++) {
      for (const sign of [1, -1]) {
        const s = near.s + sign * k * SHIFT_STEP_M;
        if (s < 0 || s > total) continue;
        const pos = pointAlong(line, s);
        const c = computeLevelChecks(pos, others, coast, boundary, coastal);
        if (!failed(c)) {
          return { pos, checks: c, shifted: k * SHIFT_STEP_M, snapped };
        }
      }
    }
    return whyFailed(first);
  };

  const commit = (
    beach: string,
    code: string,
    level: Exclude<PlacementLevel, 'g'>,
    r: Settled,
    what: string,
    query: string | null,
    osm: NominatimResult | null,
  ) => {
    positions.get(beach)!.push(r.pos);
    const text = [
      ...reasons.get(code)!,
      `nível ${level}: ${what}${r.snapped >= 2 ? `; ajustado ${r.snapped} m até a linha da costa` : ''}${r.shifted ? `; deslocado ${r.shifted} m ao longo do litoral para respeitar ${MIN_SPACING_M} m` : ''}`,
    ].join(' → ');
    done.set(code, {
      kind: 'placed',
      code,
      ...r.pos,
      checks: r.checks,
      source: {
        provider: 'auto',
        method: 'auto-placed',
        level,
        basis: BASIS[level],
        confidence: CONFIDENCE[level],
        reason: text,
        query,
        geometry: [],
        osm: osm
          ? {
              type: osm.osm_type,
              id: osm.osm_id,
              displayName: osm.display_name,
            }
          : null,
        placedAt: today,
      },
    });
  };

  // a, b, c: por ponto, sem depender dos vizinhos.
  for (const { beach, point } of todo) {
    const code = point.code;
    const loc = locations[code];
    // a) referências da descrição
    const refs = descriptionReferences(loc);
    const aQueries = refs.map(inCity);
    const hits = refs
      .map((ref) => ({
        q: inCity(ref),
        r: (lookup[inCity(ref)] ?? []).find(
          (r) =>
            inBoundary(asPos(r), boundary) &&
            referenceMatches(ref, elementName(r)),
        ),
      }))
      .filter((h): h is { q: string; r: NominatimResult } => !!h.r);
    if (hits.length === 0) {
      why(
        code,
        `a: ${aQueries.length ? 'nenhuma referência da descrição encontrada em Salvador' : 'a descrição não traz referência geocodificável'}`,
      );
    } else {
      const ps = hits.map((h) => asPos(h.r));
      let spread = 0;
      for (const x of ps)
        for (const y of ps) spread = Math.max(spread, distanceM(x, y));
      if (hits.length >= 2 && spread > MAX_REFERENCE_SPREAD_M) {
        why(
          code,
          `a: as referências discordam (${Math.round(spread)} m entre si, máximo ${MAX_REFERENCE_SPREAD_M} m)`,
        );
      } else {
        const res = settle(beach, centroid(ps));
        if (typeof res !== 'string') {
          commit(
            beach,
            code,
            'a',
            res,
            `${hits.length} referência(s) da descrição (${hits.map((h) => h.q.split(',')[0]).join('; ')})`,
            hits.map((h) => h.q).join(' | '),
            hits[0]!.r,
          );
          continue;
        }
        why(code, `a: ${res}`);
      }
    }
    // b) nome da praia
    const search = osmSearchName(beach, hints);
    const bQueries = beachNameQueries(beach, hints);
    const b = bQueries
      .flatMap((q) => (lookup[q] ?? []).map((r) => ({ q, r })))
      .find(
        ({ r }) =>
          r.category !== 'place' &&
          namesMatch(search, elementName(r)) &&
          inBoundary(asPos(r), boundary),
      );
    if (!b) {
      why(code, 'b: o nome da praia não deu resultado em Salvador');
    } else {
      const res = settle(beach, asPos(b.r));
      if (typeof res !== 'string') {
        commit(
          beach,
          code,
          'b',
          res,
          `nome da praia (${elementName(b.r)})`,
          b.q,
          b.r,
        );
        continue;
      }
      why(code, `b: ${res}`);
    }
    // c) bairro ou localidade
    const cQueries = localityQueries(beach, loc, hints);
    const c = cQueries
      .flatMap((q) => (lookup[q] ?? []).map((r) => ({ q, r })))
      .find(
        ({ r }) => r.category === 'place' && inBoundary(asPos(r), boundary),
      );
    if (!c) {
      why(code, 'c: nenhuma localidade encontrada em Salvador');
    } else {
      const res = settle(beach, asPos(c.r));
      if (typeof res !== 'string') {
        commit(
          beach,
          code,
          'c',
          res,
          `localidade (${elementName(c.r)})`,
          c.q,
          c.r,
        );
        continue;
      }
      why(code, `c: ${res}`);
    }
  }

  // Âncoras para d e e: pontos posicionados por g, a, b, verificados e manuais (não c, d, e).
  const level = (p: CatalogPoint) =>
    p.source?.method === 'auto-placed' ? (p.source.level ?? 'g') : null;
  const anchors: Anchor[] = [];
  for (const b of catalog.beaches) {
    for (const p of b.points) {
      const i = indexOf.get(p.code);
      if (i === undefined || p.lat === null || p.lng === null) continue;
      const lv = level(p);
      if (lv === null || lv === 'g' || lv === 'a' || lv === 'b') {
        anchors.push({
          code: p.code,
          index: i,
          pos: { lat: p.lat, lng: p.lng },
        });
      }
    }
  }
  for (const [code, plan] of done) {
    const lv = plan.kind === 'placed' ? plan.source.level : null;
    const i = indexOf.get(code);
    if (
      plan.kind === 'placed' &&
      i !== undefined &&
      (lv === 'a' || lv === 'b')
    ) {
      anchors.push({ code, index: i, pos: { lat: plan.lat, lng: plan.lng } });
    }
  }
  const report = orderReport(anchors, coast.chain);
  const onChain = anchors
    .map((a) => ({ ...a, n: nearestOnPolyline(a.pos, coast.chain) }))
    .filter((a) => a.n.dist <= MAX_DISTANCE_TO_COAST_M);

  // d e e: pontos ainda sem posição, na ordem do boletim.
  const rest = todo
    .filter((t) => !done.has(t.point.code))
    .sort(
      (x, y) =>
        (indexOf.get(x.point.code) ?? 1e9) - (indexOf.get(y.point.code) ?? 1e9),
    );
  for (const { beach, point } of rest) {
    const code = point.code;
    if (isLagoon(beach)) {
      why(
        code,
        'd e e: lagoa não é litoral do mar, a interpolação e o último recurso pela costa não se aplicam',
      );
      done.set(code, {
        kind: 'unplaced',
        code,
        note: reasons.get(code)!.join(' → '),
      });
      continue;
    }
    const i = indexOf.get(code);
    const before =
      i === undefined
        ? undefined
        : [...anchors]
            .filter((a) => a.index < i)
            .sort((x, y) => y.index - x.index)[0];
    const after =
      i === undefined
        ? undefined
        : [...anchors]
            .filter((a) => a.index > i)
            .sort((x, y) => x.index - y.index)[0];
    // d) interpolação pela ordem
    if (!report.consistent) {
      why(
        code,
        `d: a ordem do boletim não acompanha o litoral (tau ${report.tau}, mínimo ${MIN_ORDER_TAU})`,
      );
    } else if (!before || !after) {
      why(
        code,
        'd: falta vizinho posicionado de um dos lados na ordem do boletim',
      );
    } else {
      const sb = onChain.find((a) => a.code === before.code)?.n.s;
      const sa = onChain.find((a) => a.code === after.code)?.n.s;
      if (sb === undefined || sa === undefined) {
        why(code, 'd: um dos vizinhos não está sobre o litoral');
      } else if ((sa - sb) * report.direction < 0) {
        why(code, 'd: os vizinhos estão fora da ordem do litoral');
      } else {
        const s =
          sb + ((sa - sb) * (i! - before.index)) / (after.index - before.index);
        const res = settle(beach, pointAlong(coast.chain, s));
        if (typeof res !== 'string') {
          commit(
            beach,
            code,
            'd',
            res,
            `entre ${before.code} e ${after.code}, pela ordem do boletim, ao longo do litoral`,
            null,
            null,
          );
          continue;
        }
        why(code, `d: ${res}`);
      }
    }
    // e) último recurso: litoral mais próximo do centro dos vizinhos
    const refs = [before, after].filter((a): a is Anchor => !!a);
    const center = refs.length
      ? centroid(refs.map((a) => a.pos))
      : anchors.length
        ? centroid(anchors.map((a) => a.pos))
        : null;
    const near = center ? nearestOnGeometry(center, coast.geometry) : null;
    if (!near) {
      why(code, 'e: sem vizinhos posicionados nem litoral para ancorar');
      done.set(code, {
        kind: 'unplaced',
        code,
        note: reasons.get(code)!.join(' → '),
      });
      continue;
    }
    const res = settle(beach, near.point);
    if (typeof res === 'string') {
      why(code, `e: ${res}`);
      done.set(code, {
        kind: 'unplaced',
        code,
        note: reasons.get(code)!.join(' → '),
      });
      continue;
    }
    commit(
      beach,
      code,
      'e',
      res,
      refs.length
        ? `ponto do litoral mais próximo do centro de ${refs.map((a) => a.code).join(' e ')}`
        : 'ponto do litoral mais próximo do centro dos pontos posicionados',
      null,
      null,
    );
  }

  // Espaçamento final de cada ponto contra a posição FINAL dos outros da praia.
  for (const b of catalog.beaches) {
    const final = b.points.map((p) => {
      const d = done.get(p.code);
      if (d?.kind === 'placed') return { lat: d.lat, lng: d.lng };
      return p.lat !== null && p.lng !== null
        ? { lat: p.lat, lng: p.lng }
        : null;
    });
    plans.set(
      b.name,
      b.points.map((p, i): PointPlan => {
        const d = done.get(p.code);
        if (!d) return { kind: 'skip', code: p.code };
        if (d.kind !== 'placed') return d;
        const others = final.filter(
          (x, j): x is LatLng => j !== i && x !== null,
        );
        const checks = computeLevelChecks(
          { lat: d.lat, lng: d.lng },
          others,
          coast,
          boundary,
          !isLagoon(b.name),
        );
        return failed(checks)
          ? {
              kind: 'unplaced',
              code: p.code,
              note: `${reasons.get(p.code)!.join(' → ')} → verificação final: ${whyFailed(checks)}`,
            }
          : { ...d, checks };
      }),
    );
  }
  return { plans, order: report };
}
