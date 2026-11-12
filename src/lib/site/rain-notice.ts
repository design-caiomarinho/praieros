import type { ChipStatus } from '../rules/status.ts';

/** Texto do aviso de chuva. É do design (Figma 123:2645), não do boletim. */
export const RAIN_NOTICE_TEXT =
  'Depois de chuva forte, a água pode piorar. Evite o banho e confira o próximo boletim.';

/**
 * Mostra o aviso de chuva quando pelo menos um ponto exibido está Própria.
 * `statuses` são os status mostrados na ficha (para praia desatualizada, o último status conhecido).
 * Sem pontos (referência, sem resultado, antiga demais, nunca apareceu) ou com todos
 * Impróprios/Sem resultado: não mostra. Função pura.
 */
export function shouldShowRainNotice(statuses: readonly ChipStatus[]): boolean {
  return statuses.some((s) => s === 'suitable');
}
