import suitableSvg from '../../icons/marker-suitable-16.svg?raw';
import unsuitableSvg from '../../icons/marker-unsuitable-16.svg?raw';
import outdatedSvg from '../../icons/marker-outdated-16.svg?raw';
import noResultSvg from '../../icons/marker-no-result-16.svg?raw';
import selectedSvg from '../../icons/marker-selected-24.svg?raw';
import type { ChipStatus } from '../../lib/rules/status.ts';

// Símbolo e variante visual de cada status (cor + símbolo: nunca só cor).
const BY_STATUS = {
  suitable: { tone: 'positive', svg: suitableSvg },
  unsuitable: { tone: 'negative', svg: unsuitableSvg },
  outdated: { tone: 'warning', svg: outdatedSvg },
  'no-result': { tone: 'unknown', svg: noResultSvg },
} as const;

/** O que um marcador mostra: ponto único, praia agrupada ou pin numerado. */
export interface MarkerView {
  /** Id do ponto, ou slug da praia no marcador agrupado. */
  id: string;
  slug: string;
  status: ChipStatus;
  ariaLabel: string;
  /** Nome da praia (texto visível); null = sem texto. */
  label: string | null;
  /** Selo ao lado do ícone: quantidade ("2"), divergência ("1/2") ou número do pin ("1"). */
  tag: { text: string; divergent: boolean } | null;
}

/** Botão acessível do marcador (Figma 117:4522). Estilos em `beach-map.astro` (globais). */
export function createMarkerElement(view: MarkerView): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'marker';
  el.setAttribute('aria-label', view.ariaLabel);
  el.setAttribute('aria-pressed', 'false');
  el.dataset.markerId = view.id;
  el.dataset.beachMarker = view.slug;

  const badge = document.createElement('span');
  badge.className = 'marker__badge';
  badge.setAttribute('aria-hidden', 'true');
  el.append(badge);

  if (view.tag) {
    const tag = document.createElement('span');
    tag.className = 'marker__tag';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = view.tag.text;
    if (view.tag.divergent) tag.dataset.divergent = '';
    el.append(tag);
  }
  if (view.label) {
    const label = document.createElement('span');
    label.className = 'marker__label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = view.label;
    el.append(label);
  }
  setMarkerState(el, view.status, false);
  return el;
}

/** Normal (por status) ou selecionado (azul, ícone de pino). */
export function setMarkerState(
  el: HTMLElement,
  status: ChipStatus,
  selected: boolean,
): void {
  const badge = el.querySelector('.marker__badge')!;
  const { tone, svg } = BY_STATUS[status];
  // Troca só a variante: as classes do MapLibre (`maplibregl-marker`, âncora) posicionam o marcador.
  el.classList.remove(
    ...[...el.classList].filter((c) => c.startsWith('marker--')),
  );
  el.classList.add('marker', `marker--${selected ? 'selected' : tone}`);
  el.setAttribute('aria-pressed', String(selected));
  badge.innerHTML = selected ? selectedSvg : svg;
}

/** Mostra ou esconde só o texto do nome (sem animação). Ícone, número e selo ficam. */
export function setLabelVisible(el: HTMLElement, visible: boolean): void {
  el.dataset.label = visible ? 'shown' : 'hidden';
}

/** Deslocamento para ancorar o ponto no centro do círculo (24px) ou na ponta do pino. */
export const MARKER_OFFSET = { normal: [0, -12], selected: [0, -24] } as const;
