import type { RulePoint } from '../rules/types.ts';
import type { Catalog } from './types.ts';

/** Caixa aproximada de Salvador (graus). Só barra erro grosseiro de digitação. */
export const SALVADOR_BOUNDS = {
  lat: [-13.1, -12.7],
  lng: [-38.75, -38.2],
} as const;

export interface CatalogReport {
  /** Códigos do boletim atual que não existem no catálogo (erro). */
  missing: { code: string; beach: string }[];
  /** Códigos do catálogo que não estão no boletim atual (aviso: pode ser R3). */
  extra: { code: string; beach: string }[];
  /** Pontos sem coordenada: ficam fora do mapa (aviso). */
  unmapped: { code: string; beach: string }[];
  /** Códigos repetidos ou coordenadas inválidas (erro). */
  invalid: { code: string; beach: string; reason: string }[];
  /** Pontos com posição ainda não verificada: só aparecem em desenvolvimento (aviso). */
  unverified: { code: string; beach: string }[];
  /** Sem `missing` nem `invalid`. */
  ok: boolean;
}

const inRange = (v: number, [min, max]: readonly [number, number]) =>
  Number.isFinite(v) && v >= min && v <= max;

/** Confere o catálogo contra os pontos do boletim atual. Função pura. */
export function validateCatalog(
  catalog: Catalog,
  currentPoints: readonly RulePoint[],
): CatalogReport {
  const report: CatalogReport = {
    missing: [],
    extra: [],
    unmapped: [],
    unverified: [],
    invalid: [],
    ok: true,
  };
  const seen = new Set<string>();
  for (const beach of catalog.beaches) {
    for (const p of beach.points) {
      const id = { code: p.code, beach: beach.name };
      if (seen.has(p.code)) {
        report.invalid.push({ ...id, reason: 'código repetido' });
      }
      seen.add(p.code);
      if (p.verified && (p.lat === null || p.lng === null)) {
        report.invalid.push({ ...id, reason: 'verificado sem coordenadas' });
      }
      if (p.lat === null && p.lng === null) {
        report.unmapped.push(id);
      } else if (p.lat === null || p.lng === null) {
        report.invalid.push({ ...id, reason: 'só uma das coordenadas' });
      } else if (
        !inRange(p.lat, SALVADOR_BOUNDS.lat) ||
        !inRange(p.lng, SALVADOR_BOUNDS.lng)
      ) {
        report.invalid.push({ ...id, reason: 'coordenada fora de Salvador' });
      } else if (!p.verified) {
        report.unverified.push(id);
      }
    }
  }
  const inBulletin = new Set(currentPoints.map((p) => p.code));
  for (const p of currentPoints) {
    if (!seen.has(p.code))
      report.missing.push({ code: p.code, beach: p.beach });
  }
  for (const beach of catalog.beaches) {
    for (const p of beach.points) {
      if (!inBulletin.has(p.code)) {
        report.extra.push({ code: p.code, beach: beach.name });
      }
    }
  }
  report.ok = report.missing.length === 0 && report.invalid.length === 0;
  return report;
}
