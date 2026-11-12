import type { Status } from '../rules/status.ts';
import type { BeachKind } from '../rules/types.ts';

/** Resolução CONAMA nº 274/2000. URL provisória (ver docs/decisions.md). */
export const CONAMA_URL =
  'https://www.ana.gov.br/portalpnqa/Publicacao/Resolu%C3%A7%C3%A3o_Conama_274_Balneabilidade.pdf';

/** Subtítulo do painel Classificação (Figma 125:3918). */
export const CLASSIFICATION_INTRO =
  'O resultado vale para o ponto de coleta, segundo o critério da Resolução CONAMA nº 274/2000.';

/** Textos do painel para um status (Figma 125:4179, 125:4165 e 126:7211). */
export interface ClassificationContent {
  status: Status;
  /** Bloco "Na fonte": texto da CONAMA, citado sem reescrever. */
  source: string;
  /** Bloco "Em linguagem simples". */
  plain: string;
  /** Frase sob o chip no bloco "Status". */
  statusText: string;
}

/**
 * Textos por status. `null` = texto pendente (não há copy aprovada): a Classificação
 * não é oferecida. Só Própria tem texto no design; ver docs/copy.md.
 */
export const CLASSIFICATION_CONTENT: Record<
  Status,
  ClassificationContent | null
> = {
  suitable: {
    status: 'suitable',
    source:
      'Águas consideradas próprias são aquelas em que a quantidade de bactérias indicadoras de contaminação fecal se mantém dentro dos limites definidos para o uso de recreação de contato primário.',
    plain:
      'A análise mede a quantidade de bactérias de origem fecal na água. Neste ponto, o valor ficou abaixo do limite no dia da coleta. Depois de chuva forte, o resultado pode mudar.',
    statusText:
      'A água ficou dentro do limite definido para o banho neste ponto, de acordo com a análise feita na coleta mais recente do boletim.',
  },
  unsuitable: null,
  'no-result': null,
};

/**
 * Decide se a Classificação é oferecida para a praia e com que texto. Função pura.
 * - Só praia que mostra status: `current` ou `stale` (desatualizada usa o último status).
 * - Sem resultado (`never`, `too-old`) e praia de referência: não é oferecida.
 * - Status é o pior dos pontos (D1); a classificação só vale se ele tem texto aprovado.
 */
export function classificationFor(beach: {
  kind: BeachKind;
  worstStatus: Status;
}): ClassificationContent | null {
  if (beach.kind !== 'current' && beach.kind !== 'stale') return null;
  return CLASSIFICATION_CONTENT[beach.worstStatus];
}
