import { SALVADOR_BOUNDS } from './validate-catalog.ts';
import type { OsmSource } from './types.ts';

/** Campos do Nominatim (`format=jsonv2&addressdetails=1`) que usamos. */
export interface NominatimResult {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
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
 * Decide se a resposta do OSM para uma praia é aceitável. Só aceita quando há
 * exatamente um candidato que é praia e está dentro de Salvador; senão descarta
 * com o motivo (nunca escolhe entre candidatas). Função pura.
 */
export function decideCandidate(
  results: readonly NominatimResult[],
  query: string,
  today: string,
): Decision {
  if (results.length === 0) return { ok: false, reason: 'não encontrada' };
  const beaches = results.filter(isBeach);
  if (beaches.length === 0) {
    return { ok: false, reason: 'o OSM não traz uma praia com esse nome' };
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
      query,
      osmType: r.osm_type,
      osmId: r.osm_id,
      displayName: r.display_name,
      fetchedAt: today,
    },
  };
}

/** Consultas em ordem; a segunda só roda se a primeira não aceitar. */
export function queriesFor(beachName: string): string[] {
  return [
    `${beachName}, Salvador, Bahia`,
    `Praia de ${beachName}, Salvador, Bahia`,
  ];
}
