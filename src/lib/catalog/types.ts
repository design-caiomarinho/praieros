/** De onde veio um dado do catálogo (proposta automática do OpenStreetMap). */
export interface OsmSource {
  provider: 'osm';
  /** Como a posição foi obtida: nome da praia (Nominatim), lista do Overpass ou descrição do local. */
  method: 'name' | 'overpass' | 'description' | 'reverse';
  /** Confiança da proposta: name = high, overpass e reverse = medium, description = low. */
  confidence: 'high' | 'medium' | 'low';
  /** Consulta enviada ao Nominatim. */
  query: string;
  osmType: string;
  osmId: number;
  displayName: string;
  /** AAAA-MM-DD da consulta. */
  fetchedAt: string;
}

/** Posição ou bairro definido à mão na página de revisão (`/dev/catalog-review`). */
export interface ManualSource {
  provider: 'manual';
  method: 'manual';
  /** AAAA-MM-DD da edição. */
  editedAt: string;
}

export type CatalogSource = OsmSource | ManualSource;

/**
 * Ponto de coleta no catálogo. `lat`/`lng` null = sem posição (fica fora do mapa).
 * `verified: false` = proposta automática ainda não conferida: nunca vai para produção.
 */
export interface CatalogPoint {
  code: string;
  lat: number | null;
  lng: number | null;
  source: CatalogSource | null;
  /** Propostas automáticas substituídas por uma edição manual (só cresce, nunca é apagado). */
  proposals: OsmSource[];
  verified: boolean;
}

/** Praia no catálogo. `name` é igual ao do boletim. */
export interface CatalogEntry {
  name: string;
  neighborhood: string | null;
  neighborhoodSource: CatalogSource | null;
  /** Propostas de bairro substituídas por edição manual (só cresce). */
  neighborhoodProposals: OsmSource[];
  neighborhoodVerified: boolean;
  /** Motivo de a proposta automática ter descartado a praia (null se não houve descarte). */
  proposalNote: string | null;
  points: CatalogPoint[];
}

export interface Catalog {
  schemaVersion: 4;
  region: 'salvador';
  beaches: CatalogEntry[];
}
