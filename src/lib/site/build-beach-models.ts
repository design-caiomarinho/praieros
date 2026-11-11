import {
  accuracyOf,
  shownInProduction,
  type Accuracy,
} from '../catalog/placement.ts';
import type { Catalog } from '../catalog/types.ts';
import { evaluateBeaches, summarize } from '../rules/evaluate.ts';
import { beachKey } from '../rules/group.ts';
import type {
  BeachAliases,
  BeachKind,
  BulletinRef,
  PointState,
  RuleBulletin,
  Status,
  Summary,
} from '../rules/types.ts';

export interface PointModel {
  code: string;
  /** Descrição do local da coleta, como no boletim. */
  location: string | null;
  status: Status;
  /** Boletim de onde vem o status (atual ou última aparição); null se nunca apareceu. */
  bulletin: BulletinRef | null;
  /** Só `stale`: o status é de um boletim antigo. */
  stale: boolean;
  /** Posição aproximada. null = sem coordenada. */
  position: { lat: number; lng: number } | null;
  /** false = fica fora do mapa (sem coordenada). */
  onMap: boolean;
  /** Posição automática (não aprovada à mão): a interface avisa "Posição aproximada". */
  accuracy: Accuracy | null;
}

/** Faixa a mostrar na ficha. `none` = nenhuma (inclui "Sem resultado"). */
export type BannerKind = 'outdated' | 'none';

export interface BeachModel {
  slug: string;
  name: string;
  neighborhood: string | null;
  kind: BeachKind;
  points: PointModel[];
  /** D1: pior status entre os pontos que mostram status. */
  worstStatus: Status;
  shownPoints: number;
  improperPoints: number;
  stalePoints: number;
  /** Boletim da data exibida: o atual, ou a última aparição se `banner` for `outdated`. */
  referenceBulletin: BulletinRef | null;
  banner: BannerKind;
  /** `too-old`: data da última análise (AAAA-MM-DD). Nunca o status antigo. */
  lastAnalysisDate: string | null;
  /** `never`: a praia não consta no boletim atual. */
  notInCurrentBulletin: boolean;
}

export interface SiteModel {
  current: BulletinRef | null;
  beaches: BeachModel[];
  /** D2: conta pontos. */
  summary: Summary;
}

export interface BuildOptions {
  aliases?: BeachAliases;
  staleLimit?: number;
  /**
   * Mostra posições e bairros do catálogo que ainda não passaram pela regra de produção.
   * Só para desenvolvimento (`import.meta.env.DEV`). Em produção (`false`) aparecem os pontos
   * `verified: true` e os automáticos que passaram em todas as verificações (`shownInProduction`).
   */
  includeUnverified?: boolean;
}

/** Slug estável derivado do nome do boletim (sem caixa nem acento; hífen no lugar de espaços). */
export function beachSlug(name: string): string {
  return beachKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Camada de dados do site: aplica R1–R4 e D1–D3 (via `evaluateBeaches`) e junta o
 * catálogo (bairro e coordenadas). Função pura, sem I/O.
 */
export function buildSiteModel(
  bulletins: readonly RuleBulletin[],
  catalog: Catalog,
  options: BuildOptions = {},
): SiteModel {
  const { aliases = {}, staleLimit, includeUnverified = false } = options;
  const shownNeighborhood = (b: Catalog['beaches'][number]) =>
    b.neighborhoodVerified || includeUnverified ? b.neighborhood : null;

  const evaluation = evaluateBeaches(bulletins, {
    aliases,
    staleLimit,
    catalog: catalog.beaches.map((b) => ({
      name: b.name,
      neighborhood: shownNeighborhood(b) ?? undefined,
    })),
  });

  const entries = new Map(
    catalog.beaches.map((b) => [beachKey(b.name, aliases), b]),
  );

  const beaches = evaluation.beaches.map((state): BeachModel => {
    const entry = entries.get(state.key);
    const coords = new Map(entry?.points.map((p) => [p.code, p]) ?? []);

    const toModel = (code: string, p: PointState | undefined): PointModel => {
      const c = coords.get(code);
      const position =
        c &&
        c.lat !== null &&
        c.lng !== null &&
        (shownInProduction(c) || includeUnverified)
          ? { lat: c.lat, lng: c.lng }
          : null;
      return {
        code,
        location: p?.location ?? null,
        status: p?.status ?? 'no-result',
        bulletin: !p ? null : p.kind === 'current' ? p.bulletin : p.lastSeen,
        stale: p?.kind === 'stale',
        position,
        onMap: position !== null,
        accuracy: position !== null && c ? accuracyOf(c) : null,
      };
    };

    const byCode = new Map(state.points.map((p) => [p.code, p]));
    const codes = new Set([...byCode.keys(), ...coords.keys()]);
    const points = [...codes]
      .sort((a, b) => a.localeCompare(b))
      .map((code) => toModel(code, byCode.get(code)));

    const lastSeen = state.points
      .flatMap((p) => (p.kind === 'current' ? [] : [p.lastSeen]))
      .find((r) => r.issuedAt === state.displayDate);

    return {
      slug: beachSlug(state.name),
      name: state.name,
      neighborhood: entry ? shownNeighborhood(entry) : null,
      kind: state.kind,
      points,
      worstStatus: state.worstStatus,
      shownPoints: state.shownPoints,
      improperPoints: state.improperPoints,
      stalePoints: state.stalePoints,
      referenceBulletin:
        state.kind === 'stale' ? (lastSeen ?? null) : evaluation.current,
      banner: state.kind === 'stale' ? 'outdated' : 'none',
      lastAnalysisDate: state.lastAnalysisDate,
      notInCurrentBulletin: state.kind === 'never',
    };
  });

  return {
    current: evaluation.current,
    beaches,
    summary: summarize(evaluation.beaches),
  };
}
