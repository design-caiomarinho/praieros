import type { Category } from '../inema/bulletin.ts';

/** Status exibível de um ponto ou praia (valores em inglês; rótulos em `STATUS_LABELS`). */
export type Status = 'suitable' | 'unsuitable' | 'no-result';

/** Status do StatusChip: os de `Status` mais `outdated` (Desatualizado), que só existe na interface. */
export type ChipStatus = Status | 'outdated';

/** Rótulos mostrados ao usuário (pt-BR). */
export const STATUS_LABELS: Record<ChipStatus, string> = {
  suitable: 'Própria',
  unsuitable: 'Imprópria',
  outdated: 'Desatualizado',
  'no-result': 'Sem resultado',
};

/**
 * Único lugar que converte o valor do boletim (`Category`, em português, como vem do
 * Inema e como é gravado em data/bulletins/) para o enum `Status`.
 * `null` = o boletim não traz informação utilizável do ponto.
 */
export function categoryToStatus(category: Category): 'suitable' | 'unsuitable';
export function categoryToStatus(category: Category | null): Status;
export function categoryToStatus(category: Category | null): Status {
  if (category === 'Própria') return 'suitable';
  if (category === 'Imprópria') return 'unsuitable';
  return 'no-result';
}
