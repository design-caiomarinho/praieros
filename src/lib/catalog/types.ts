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

/**
 * Posição achada automaticamente por `npm run catalog:place`: pela pista da descrição do local
 * (`description`), distribuída ao longo da geometria da praia (`spread`) ou só pela descrição,
 * sem geometria no OSM (`description-only`, nunca vai para produção sem aprovação).
 */
export interface AutoSource {
  provider: 'auto';
  method: 'auto-placed';
  basis: 'description' | 'spread' | 'description-only';
  confidence: 'medium' | 'low';
  /** Consulta enviada ao Nominatim (só `description` e `description-only`). */
  query: string | null;
  /** Elementos do OSM cuja geometria foi usada (ex.: `way/123`). */
  geometry: string[];
  /** Resultado do Nominatim usado (só `description` e `description-only`). */
  osm: { type: string; id: number; displayName: string } | null;
  /** AAAA-MM-DD do posicionamento. */
  placedAt: string;
}

export type CatalogSource = OsmSource | ManualSource | AutoSource;

/** Propostas guardadas quando uma edição substitui a posição. */
export type ProposalSource = OsmSource | AutoSource;

export type CheckStatus = 'pass' | 'fail' | 'n/a';
export interface Check {
  status: CheckStatus;
  /** Distância medida em metros, quando houver. */
  meters: number | null;
}

/** Verificações automáticas de um ponto posicionado (todas obrigatórias onde se aplicam). */
export interface PointChecks {
  /** Dentro do polígono administrativo de Salvador. */
  inSalvador: Check;
  /** A no máximo 80 m da geometria da praia no OSM (`n/a` se a praia não tem geometria). */
  nearBeach: Check;
  /** A pelo menos 40 m dos outros pontos da mesma praia (`n/a` se for o único). */
  minSpacing: Check;
}

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
  proposals: ProposalSource[];
  /** Resultado das verificações do posicionamento automático. */
  checks?: PointChecks | null;
  /** Por que o posicionamento automático não deu posição (vai para docs/catalog-todo.md). */
  placementNote?: string | null;
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
