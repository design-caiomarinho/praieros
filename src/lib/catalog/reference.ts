import type { OsmSource } from './types.ts';
import { normalizeBeachName } from '../rules/group.ts';
import {
  distanceM,
  distanceToGeometryM,
  inBoundary,
  nearestOnGeometry,
  centroid,
  type Boundary,
  type Geometry,
  type LatLng,
} from './geo.ts';
import { osmSearchName, type OsmNameHints } from './osm-hints.ts';
import { geometryForBeach, linesOf, type GeomElement } from './placement.ts';
import { nameTokens, namesMatch } from './propose.ts';

// Praias de referência: praias com nome no OpenStreetMap, dentro de Salvador, que não
// constam no boletim. Funções puras; o script `npm run catalog:reference` só busca e grava.

/** Praia de referência gravada em `data/catalog/reference-beaches.json`. Sem ponto de coleta. */
export interface ReferenceBeach {
  /** Nome como no OpenStreetMap. */
  name: string;
  osmType: string;
  osmId: number;
  /** Posição representativa, sobre a própria geometria da praia. */
  lat: number;
  lng: number;
  /** Origem da posição. */
  source: 'osm';
  /** AAAA-MM-DD da consulta. */
  fetchedAt: string;
  /** Bairro por consulta inversa do OSM (`npm run catalog:neighborhoods`); opcional. */
  neighborhood?: string | null;
  neighborhoodSource?: OsmSource | null;
}

export interface ReferenceFile {
  schemaVersion: 1;
  region: 'salvador';
  beaches: ReferenceBeach[];
}

/** Praia do boletim ou do catálogo, para comparar com as do OSM. */
export interface KnownBeach {
  name: string;
  /** Posições dos pontos de coleta que já têm coordenada. */
  points: readonly LatLng[];
}

/** Suspeita de duplicata: referência perto de uma praia do boletim ou com nome parecido. */
export interface DuplicateSuspect {
  reference: string;
  known: string;
  /** Menor distância em metros entre a referência e a praia do boletim; null se não há como medir. */
  distanceM: number | null;
  reasons: ('near' | 'similar-name')[];
}

export const DUPLICATE_DISTANCE_M = 300;

const core = (name: string) => nameTokens(name).join(' ');

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/**
 * Nomes parecidos: um contido no outro (palavras inteiras seguidas, nos dois sentidos)
 * ou diferença pequena de grafia (1 letra em nomes curtos, 2 a partir de 7 letras).
 */
export function similarNames(a: string, b: string): boolean {
  const ca = core(a);
  const cb = core(b);
  if (!ca || !cb) return false;
  if (namesMatch(a, b) || namesMatch(b, a)) return true;
  const shortest = Math.min(ca.length, cb.length);
  if (shortest < 4) return false;
  return levenshtein(ca, cb) <= (shortest >= 7 ? 2 : 1);
}

export interface PickInput {
  /** Elementos do Overpass (`out geom`); só os com `natural=beach` e nome contam. */
  elements: readonly GeomElement[];
  boundary: Boundary;
  /** Praias do boletim e do catálogo (inclui as que o site não exibe, como lagoas). */
  known: readonly KnownBeach[];
  hints?: OsmNameHints;
  /** Nomes a ignorar (`reference-exclude.json`). */
  exclude?: readonly string[];
  today: string;
}

export interface PickResult {
  references: ReferenceBeach[];
  /** Nomes do OSM que casaram com uma praia do boletim ou do catálogo. */
  matched: string[];
  /** Nomes do OSM fora de Salvador. */
  outside: string[];
  /** Nomes do OSM ignorados por `reference-exclude.json`. */
  excluded: string[];
  suspects: DuplicateSuspect[];
}

/** Ponto sobre a geometria mais próximo do centro dela. */
export function representativePoint(g: Geometry): LatLng {
  const all = g.lines.flatMap((l) => l.pts);
  return nearestOnGeometry(centroid(all), g)?.point ?? all[0]!;
}

/** Uma praia do OSM casa com uma praia conhecida pelo nome (com a dica de grafia, se houver). */
function matchesKnown(
  osmName: string,
  known: readonly KnownBeach[],
  hints?: OsmNameHints,
): boolean {
  return known.some(
    (k) =>
      normalizeBeachName(k.name) === normalizeBeachName(osmName) ||
      namesMatch(osmSearchName(k.name, hints), osmName),
  );
}

export function pickReferenceBeaches(input: PickInput): PickResult {
  const { elements, boundary, known, hints, exclude = [], today } = input;
  const excludeKeys = new Set(exclude.map(normalizeBeachName));

  // Agrupa os elementos de mesmo nome (uma praia pode ter várias linhas no OSM).
  const groups = new Map<string, GeomElement[]>();
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name || el.tags?.natural !== 'beach') continue;
    const key = normalizeBeachName(name);
    groups.set(key, [...(groups.get(key) ?? []), el]);
  }

  // Geometria de cada praia conhecida no OSM (para medir a distância), uma vez só.
  const knownGeometry = new Map(
    known.map((k) => [k, geometryForBeach(k.name, elements, hints, boundary)]),
  );

  const result: PickResult = {
    references: [],
    matched: [],
    outside: [],
    excluded: [],
    suspects: [],
  };

  for (const [key, els] of groups) {
    const name = els[0]!.tags!.name!;
    const lines = els.flatMap(linesOf);
    // Sem geometria (nó) ou com nenhum ponto em Salvador: fica de fora.
    if (!lines.some((l) => l.pts.some((p) => inBoundary(p, boundary)))) {
      result.outside.push(name);
      continue;
    }
    if (matchesKnown(name, known, hints)) {
      result.matched.push(name);
      continue;
    }
    if (excludeKeys.has(key)) {
      result.excluded.push(name);
      continue;
    }
    const geometry: Geometry = {
      lines,
      ids: els.map((e) => `${e.type}/${e.id}`),
    };
    const rep = representativePoint(geometry);
    // A posição representativa também precisa estar em Salvador (uma praia que só passa pela divisa não conta).
    if (!inBoundary(rep, boundary)) {
      result.outside.push(name);
      continue;
    }
    const first = els[0]!;
    result.references.push({
      name,
      osmType: first.type,
      osmId: first.id,
      lat: rep.lat,
      lng: rep.lng,
      source: 'osm',
      fetchedAt: today,
    });

    // Suspeitas de duplicata (não descarta nada).
    for (const k of known) {
      const kg = knownGeometry.get(k);
      const distances = [
        ...k.points.map((p) => distanceM(rep, p)),
        ...(kg ? [distanceToGeometryM(rep, kg)] : []),
      ];
      const d = distances.length ? Math.min(...distances) : null;
      const reasons: DuplicateSuspect['reasons'] = [];
      if (d !== null && d < DUPLICATE_DISTANCE_M) reasons.push('near');
      if (similarNames(name, k.name)) reasons.push('similar-name');
      if (reasons.length) {
        result.suspects.push({
          reference: name,
          known: k.name,
          distanceM: d === null ? null : Math.round(d),
          reasons,
        });
      }
    }
  }
  result.references.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return result;
}
