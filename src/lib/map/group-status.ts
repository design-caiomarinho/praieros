import type { Status } from '../rules/status.ts';

/**
 * Severidade para o marcador agrupado: Imprópria > Sem resultado > Própria.
 * "Desatualizada" não entra: é faixa de aviso, não status (o ponto conta com o último status).
 */
export const STATUS_SEVERITY: Record<Status, number> = {
  unsuitable: 2,
  'no-result': 1,
  suitable: 0,
};

/** Pior status da lista. Lista vazia: "no-result" (nada a afirmar). */
export function worstStatus(statuses: readonly Status[]): Status {
  let worst: Status | null = null;
  for (const s of statuses) {
    if (worst === null || STATUS_SEVERITY[s] > STATUS_SEVERITY[worst])
      worst = s;
  }
  return worst ?? 'no-result';
}

export interface GroupBadge {
  /** Pior status (define cor e símbolo do marcador). */
  status: Status;
  /** Sempre o total de pontos ("2"), com ou sem divergência. */
  text: string;
  /** Status diferentes entre os pontos: o selo ganha borda de alerta (o texto não muda). */
  divergent: boolean;
}

/** Selo ao lado do marcador agrupado. */
export function groupBadge(statuses: readonly Status[]): GroupBadge {
  const status = worstStatus(statuses);
  const total = statuses.length;
  const divergent = statuses.some((s) => s !== status);
  return { status, text: String(total), divergent };
}

const COUNT_LABELS: Record<Status, [string, string]> = {
  unsuitable: ['imprópria', 'impróprias'],
  suitable: ['própria', 'próprias'],
  'no-result': ['sem resultado', 'sem resultado'],
};

/** "Ondina, 2 pontos de coleta, 1 imprópria e 1 própria" (nome da praia uma vez só). */
export function groupAriaLabel(
  beachName: string,
  statuses: readonly Status[],
  hasOutdated = false,
): string {
  const total = statuses.length;
  const parts = (['unsuitable', 'no-result', 'suitable'] as const)
    .map((s) => {
      const n = statuses.filter((x) => x === s).length;
      return n === 0 ? null : `${n} ${COUNT_LABELS[s][n === 1 ? 0 : 1]}`;
    })
    .filter((p): p is string => p !== null);
  const counts =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
      : parts[0];
  const label = [
    beachName,
    `${total} ${total === 1 ? 'ponto' : 'pontos'} de coleta`,
    counts,
  ];
  if (hasOutdated) label.push('Boletim desatualizado');
  return label.join(', ');
}
