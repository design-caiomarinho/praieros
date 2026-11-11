import type {
  Catalog,
  CatalogEntry,
  CatalogPoint,
  ManualSource,
  OsmSource,
} from './types.ts';
import { neighborhoodOf, type NominatimResult } from './propose.ts';
import { SALVADOR_BOUNDS } from './validate-catalog.ts';

// Lógica da página de revisão do catálogo (`/dev/catalog-review`). Tudo puro: o endpoint de
// desenvolvimento só lê o arquivo, chama estas funções e grava o resultado.

export type BeachState = 'unplaced' | 'proposed' | 'verified';

/** Ações que a página pode pedir. `verified: true` só nasce de `approve`. */
export type ReviewAction =
  | { type: 'approve'; beach: string }
  | { type: 'move'; beach: string; code: string; lat: number; lng: number }
  | {
      type: 'neighborhood';
      beach: string;
      value: string;
      /** Sugestão do OSM usada como está (consulta inversa); sem ela, a edição é manual. */
      suggestion?: OsmSource;
    };

export type ReviewResult =
  { ok: true; catalog: Catalog } | { ok: false; error: string };

const isPlaced = (p: CatalogPoint) => p.lat !== null && p.lng !== null;

/** Sem posição (algum ponto sem coordenadas), proposto (falta aprovar) ou verificado. */
export function beachState(beach: CatalogEntry): BeachState {
  if (beach.points.length === 0 || !beach.points.every(isPlaced)) {
    return 'unplaced';
  }
  return beach.neighborhoodVerified && beach.points.every((p) => p.verified)
    ? 'verified'
    : 'proposed';
}

/** Aceita o catálogo v3 (sem `proposals`) ou v4. Qualquer outra versão é erro. */
export function migrateCatalog(raw: unknown): Catalog {
  const c = raw as {
    schemaVersion?: number;
    region?: string;
    beaches?: unknown[];
  };
  if (c?.schemaVersion !== 3 && c?.schemaVersion !== 4) {
    throw new Error(
      `schemaVersion do catálogo não suportado: ${c?.schemaVersion}`,
    );
  }
  const beaches = (c.beaches ?? []).map((b) => {
    const beach = b as CatalogEntry;
    return {
      ...beach,
      neighborhoodProposals: beach.neighborhoodProposals ?? [],
      points: beach.points.map((p) => ({ ...p, proposals: p.proposals ?? [] })),
    };
  });
  return { schemaVersion: 4, region: c.region as 'salvador', beaches };
}

const fail = (error: string): ReviewResult => ({ ok: false, error });

function update(
  catalog: Catalog,
  beachName: string,
  fn: (b: CatalogEntry) => CatalogEntry | string,
): ReviewResult {
  const i = catalog.beaches.findIndex((b) => b.name === beachName);
  if (i < 0) return fail(`Praia não encontrada: ${beachName}`);
  const next = fn(catalog.beaches[i]!);
  if (typeof next === 'string') return fail(next);
  const beaches = catalog.beaches.slice();
  beaches[i] = next;
  return { ok: true, catalog: { ...catalog, beaches } };
}

/** Guarda a proposta automática que está sendo substituída (sem duplicar). */
function keepProposal(list: OsmSource[], old: unknown): OsmSource[] {
  const s = old as OsmSource | null;
  if (!s || s.provider !== 'osm') return list;
  const same = (a: OsmSource) =>
    a.method === s.method && a.osmId === s.osmId && a.fetchedAt === s.fetchedAt;
  return list.some(same) ? list : [...list, s];
}

/** Aprova a praia inteira: pontos e bairro. Exige posição em todos os pontos e bairro preenchido. */
export function approveBeach(
  catalog: Catalog,
  beachName: string,
): ReviewResult {
  return update(catalog, beachName, (b) => {
    if (b.points.length === 0 || !b.points.every(isPlaced)) {
      return 'Há pontos sem posição: posicione todos antes de aprovar.';
    }
    if (!b.neighborhood?.trim()) {
      return 'Preencha o bairro antes de aprovar.';
    }
    return {
      ...b,
      neighborhoodVerified: true,
      points: b.points.map((p) => ({ ...p, verified: true })),
    };
  });
}

/** Move (ou posiciona) um ponto. Vira `manual`, guarda a proposta original e tira a aprovação. */
export function movePoint(
  catalog: Catalog,
  beachName: string,
  code: string,
  lat: number,
  lng: number,
  today: string,
): ReviewResult {
  if (!inSalvador(lat, lng)) return fail('Coordenada fora de Salvador.');
  return update(catalog, beachName, (b) => {
    if (!b.points.some((p) => p.code === code)) {
      return `Ponto não encontrado: ${code}`;
    }
    const manual: ManualSource = {
      provider: 'manual',
      method: 'manual',
      editedAt: today,
    };
    return {
      ...b,
      points: b.points.map((p) =>
        p.code === code
          ? {
              ...p,
              lat,
              lng,
              source: manual,
              proposals: keepProposal(p.proposals, p.source),
              verified: false,
            }
          : p,
      ),
    };
  });
}

/** Troca o bairro. Marca a origem (sugestão do OSM ou manual) e tira a aprovação. */
export function setNeighborhood(
  catalog: Catalog,
  beachName: string,
  value: string,
  today: string,
  suggestion?: OsmSource,
): ReviewResult {
  const text = value.trim();
  return update(catalog, beachName, (b) => {
    const proposals = keepProposal(
      b.neighborhoodProposals,
      b.neighborhoodSource,
    );
    if (!text) {
      return {
        ...b,
        neighborhood: null,
        neighborhoodSource: null,
        neighborhoodProposals: proposals,
        neighborhoodVerified: false,
      };
    }
    const useSuggestion =
      suggestion?.provider === 'osm' && suggestion.method === 'reverse';
    return {
      ...b,
      neighborhood: text,
      neighborhoodSource: useSuggestion
        ? suggestion
        : { provider: 'manual', method: 'manual', editedAt: today },
      neighborhoodProposals: useSuggestion
        ? keepProposal(b.neighborhoodProposals, b.neighborhoodSource)
        : proposals,
      neighborhoodVerified: false,
    };
  });
}

/** Aplica uma ação da página. */
export function applyAction(
  catalog: Catalog,
  action: ReviewAction,
  today: string,
): ReviewResult {
  switch (action.type) {
    case 'approve':
      return approveBeach(catalog, action.beach);
    case 'move':
      return movePoint(
        catalog,
        action.beach,
        action.code,
        action.lat,
        action.lng,
        today,
      );
    case 'neighborhood':
      return setNeighborhood(
        catalog,
        action.beach,
        action.value,
        today,
        action.suggestion,
      );
    default:
      return fail('Ação desconhecida.');
  }
}

/** Confere o corpo recebido do cliente e devolve uma ação, ou o motivo de recusar. */
export function parseAction(body: unknown): ReviewAction | string {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return 'Corpo inválido.';
  if (typeof b.beach !== 'string' || !b.beach) return 'Praia ausente.';
  switch (b.type) {
    case 'approve':
      return { type: 'approve', beach: b.beach };
    case 'move':
      if (
        typeof b.code !== 'string' ||
        typeof b.lat !== 'number' ||
        typeof b.lng !== 'number' ||
        !Number.isFinite(b.lat) ||
        !Number.isFinite(b.lng)
      ) {
        return 'Ponto ou coordenadas inválidos.';
      }
      return {
        type: 'move',
        beach: b.beach,
        code: b.code,
        lat: b.lat,
        lng: b.lng,
      };
    case 'neighborhood':
      if (typeof b.value !== 'string') return 'Bairro inválido.';
      return {
        type: 'neighborhood',
        beach: b.beach,
        value: b.value,
        suggestion: b.suggestion as OsmSource | undefined,
      };
    default:
      return 'Ação desconhecida.';
  }
}

const inRange = (v: number, [min, max]: readonly [number, number]) =>
  Number.isFinite(v) && v >= min && v <= max;
const inSalvador = (lat: number, lng: number) =>
  inRange(lat, SALVADOR_BOUNDS.lat) && inRange(lng, SALVADOR_BOUNDS.lng);

/**
 * Valida o catálogo novo contra o que está gravado, antes de gravar. Devolve a lista de erros
 * (vazia = pode gravar). Garante: esquema v4, mesmas praias e códigos (a página não cria nem
 * apaga), coordenadas válidas e dentro de Salvador, `verified` coerente e histórico preservado.
 */
export function validateForWrite(prev: Catalog, next: Catalog): string[] {
  const errors: string[] = [];
  if (next.schemaVersion !== 4) errors.push('schemaVersion deve ser 4.');
  if (next.region !== prev.region) errors.push('A região não pode mudar.');
  if (next.beaches.length !== prev.beaches.length) {
    errors.push('O número de praias não pode mudar.');
    return errors;
  }
  next.beaches.forEach((b, i) => {
    const before = prev.beaches[i]!;
    if (b.name !== before.name) {
      errors.push(`Praia fora de ordem ou renomeada: ${b.name}`);
      return;
    }
    if (
      b.points.map((p) => p.code).join('|') !==
      before.points.map((p) => p.code).join('|')
    ) {
      errors.push(`${b.name}: os códigos dos pontos não podem mudar.`);
      return;
    }
    if (b.neighborhoodVerified && !b.neighborhood?.trim()) {
      errors.push(`${b.name}: bairro verificado sem bairro.`);
    }
    if (b.neighborhoodProposals.length < before.neighborhoodProposals.length) {
      errors.push(`${b.name}: histórico de bairro apagado.`);
    }
    b.points.forEach((p, j) => {
      const old = before.points[j]!;
      const id = `${b.name} (${p.code})`;
      const hasLat = p.lat !== null;
      const hasLng = p.lng !== null;
      if (hasLat !== hasLng) errors.push(`${id}: só uma das coordenadas.`);
      else if (hasLat && !inSalvador(p.lat!, p.lng!)) {
        errors.push(`${id}: coordenada fora de Salvador.`);
      }
      if (p.verified && !(hasLat && hasLng)) {
        errors.push(`${id}: verificado sem coordenadas.`);
      }
      if (p.proposals.length < old.proposals.length) {
        errors.push(`${id}: histórico de propostas apagado.`);
      }
      const moved = p.lat !== old.lat || p.lng !== old.lng;
      if (moved && p.source?.method !== 'manual') {
        errors.push(`${id}: posição alterada sem source manual.`);
      }
      if (
        moved &&
        old.source?.provider === 'osm' &&
        !p.proposals.some(
          (x) =>
            x.method === old.source!.method &&
            x.osmId === (old.source as OsmSource).osmId,
        )
      ) {
        errors.push(`${id}: proposta original não foi preservada.`);
      }
      if (moved && p.verified && !old.verified) {
        errors.push(`${id}: mover não pode aprovar.`);
      }
    });
  });
  const seen = new Set<string>();
  for (const b of next.beaches) {
    for (const p of b.points) {
      if (seen.has(p.code)) errors.push(`Código repetido: ${p.code}`);
      seen.add(p.code);
    }
  }
  return errors;
}

/** Sugestão de bairro a partir da consulta inversa do Nominatim (`zoom=18&addressdetails=1`). */
export function reverseSuggestion(
  result: NominatimResult,
  lat: number,
  lng: number,
  today: string,
): { neighborhood: string; source: OsmSource } | null {
  const neighborhood = neighborhoodOf(result);
  if (!neighborhood) return null;
  return {
    neighborhood,
    source: {
      provider: 'osm',
      method: 'reverse',
      confidence: 'medium',
      query: `reverse ${lat.toFixed(6)},${lng.toFixed(6)}`,
      osmType: result.osm_type,
      osmId: result.osm_id,
      displayName: result.display_name,
      fetchedAt: today,
    },
  };
}
