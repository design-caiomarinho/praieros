/** De onde veio um dado do catálogo (proposta automática do OpenStreetMap). */
export interface OsmSource {
  provider: 'osm';
  /** Consulta enviada ao Nominatim. */
  query: string;
  osmType: string;
  osmId: number;
  displayName: string;
  /** AAAA-MM-DD da consulta. */
  fetchedAt: string;
}

/**
 * Ponto de coleta no catálogo. `lat`/`lng` null = sem posição (fica fora do mapa).
 * `verified: false` = proposta automática ainda não conferida: nunca vai para produção.
 */
export interface CatalogPoint {
  code: string;
  lat: number | null;
  lng: number | null;
  source: OsmSource | null;
  verified: boolean;
}

/** Praia no catálogo. `name` é igual ao do boletim. */
export interface CatalogEntry {
  name: string;
  neighborhood: string | null;
  neighborhoodSource: OsmSource | null;
  neighborhoodVerified: boolean;
  /** Motivo de a proposta automática ter descartado a praia (null se não houve descarte). */
  proposalNote: string | null;
  points: CatalogPoint[];
}

export interface Catalog {
  schemaVersion: 2;
  region: 'salvador';
  beaches: CatalogEntry[];
}
