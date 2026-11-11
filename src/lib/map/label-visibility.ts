/**
 * Zoom a partir do qual os nomes (texto) dos marcadores aparecem. Abaixo disso só os ícones,
 * números e selos. Ver a escolha do valor em docs/decisions.md.
 */
export const LABEL_MIN_ZOOM = 13;

export interface LabelState {
  zoom: number;
  selected: boolean;
  focused: boolean;
  hovered: boolean;
}

/** O nome aparece sempre quando selecionado, com foco ou hover; senão, só a partir do zoom mínimo. */
export function isLabelVisible(
  s: LabelState,
  minZoom: number = LABEL_MIN_ZOOM,
): boolean {
  return s.selected || s.focused || s.hovered || s.zoom >= minZoom;
}
