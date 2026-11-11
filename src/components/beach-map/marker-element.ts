import suitableSvg from '../../icons/marker-suitable-16.svg?raw';
import unsuitableSvg from '../../icons/marker-unsuitable-16.svg?raw';
import outdatedSvg from '../../icons/marker-outdated-16.svg?raw';
import noResultSvg from '../../icons/marker-no-result-16.svg?raw';
import selectedSvg from '../../icons/marker-selected-24.svg?raw';
import type { MarkerData } from '../../lib/site/map-markers.ts';

// Símbolo e variante visual de cada status (cor + símbolo: nunca só cor).
const BY_STATUS = {
  suitable: { tone: 'positive', svg: suitableSvg },
  unsuitable: { tone: 'negative', svg: unsuitableSvg },
  outdated: { tone: 'warning', svg: outdatedSvg },
  'no-result': { tone: 'unknown', svg: noResultSvg },
} as const;

/** Botão acessível do marcador (Figma 117:4522). Estilos em `beach-map.astro` (globais). */
export function createMarkerElement(data: MarkerData): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'marker';
  el.setAttribute('aria-label', data.ariaLabel);
  el.setAttribute('aria-pressed', 'false');
  el.dataset.markerId = data.id;

  const badge = document.createElement('span');
  badge.className = 'marker__badge';
  badge.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'marker__label';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = data.beachName;

  el.append(badge, label);
  setMarkerState(el, data, false);
  return el;
}

/** Normal (por status) ou selecionado (azul, ícone de pino). */
export function setMarkerState(
  el: HTMLElement,
  data: MarkerData,
  selected: boolean,
): void {
  const badge = el.querySelector('.marker__badge')!;
  const { tone, svg } = BY_STATUS[data.status];
  el.className = `marker marker--${selected ? 'selected' : tone}`;
  el.setAttribute('aria-pressed', String(selected));
  badge.innerHTML = selected ? selectedSvg : svg;
}

/** Deslocamento para ancorar o ponto no centro do círculo (24px) ou na ponta do pino. */
export const MARKER_OFFSET = { normal: [0, -12], selected: [0, -24] } as const;
