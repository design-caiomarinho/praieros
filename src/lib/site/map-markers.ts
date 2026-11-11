import {
  STATUS_LABELS,
  type ChipStatus,
  type Status,
} from '../rules/status.ts';
import type { BeachModel } from './build-beach-models.ts';
import { markerAriaLabel } from './panel-props.ts';

/** Um marcador por ponto de coleta (R5). Dados serializáveis para o cliente. */
export interface MarkerData {
  id: string;
  slug: string;
  beachName: string;
  lat: number;
  lng: number;
  /** `outdated` quando o ponto é de um boletim antigo (símbolo "!"). */
  status: ChipStatus;
  /** Status sem o "desatualizado" (usado na severidade do grupo). */
  baseStatus: Status;
  /** Número do ponto na praia (Ponto 1, Ponto 2), igual ao da ficha. */
  number: number;
  ariaLabel: string;
  /** Praia de referência (sem ponto de coleta): sem número nem selo. */
  reference?: boolean;
}

/** Só pontos com posição (`onMap`); `verified` já foi tratado em `buildSiteModel`. */
export function toMarkers(beaches: readonly BeachModel[]): MarkerData[] {
  const markers: MarkerData[] = [];
  for (const beach of beaches) {
    // Praia de referência: um marcador "Sem resultado" (?), sem ponto de coleta.
    if (beach.isReference && beach.referencePosition) {
      markers.push({
        id: `${beach.slug}:ref`,
        slug: beach.slug,
        beachName: beach.name,
        lat: beach.referencePosition.lat,
        lng: beach.referencePosition.lng,
        status: 'no-result',
        baseStatus: 'no-result',
        number: 1,
        ariaLabel: `${beach.name}, Praia fora do boletim, ${STATUS_LABELS['no-result']}`,
        reference: true,
      });
      continue;
    }
    beach.points.forEach((p, i) => {
      if (!p.onMap || !p.position) return;
      // Praia antiga demais ou nunca vista não mostra status antigo (R4).
      const hidden = beach.kind === 'never' || beach.kind === 'too-old';
      const shown = hidden ? 'no-result' : p.status;
      const status: ChipStatus = p.stale && !hidden ? 'outdated' : shown;
      markers.push({
        id: `${beach.slug}:${p.code}`,
        slug: beach.slug,
        beachName: beach.name,
        lat: p.position.lat,
        lng: p.position.lng,
        status,
        baseStatus: shown,
        number: i + 1,
        ariaLabel: markerAriaLabel(
          beach.name,
          i + 1,
          status,
          p.stale ? p.status : undefined,
          p.accuracy,
        ),
      });
    });
  }
  return markers;
}
