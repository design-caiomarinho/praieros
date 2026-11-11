import type { Accuracy } from '../catalog/placement.ts';

/** Textos PROVISÓRIOS do aviso de posição na ficha (docs/copy.md). Sempre visíveis, nunca escondidos. */
export const ACCURACY_LABELS: Record<Accuracy, string> = {
  approximate: 'Posição aproximada',
  'very-approximate': 'Posição muito aproximada',
};
