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

/** Zoom mínimo para os nomes aparecerem por espaço livre (abaixo disso, só ícones). */
export const LABEL_FLOOR_ZOOM = 11;

export interface LabelCandidate {
  id: string;
  /** Posição do ponto na tela (centro do ícone). */
  x: number;
  y: number;
  /** Largura do nome, em px. */
  width: number;
  /** Menor número = mais importante (ganha o espaço primeiro). */
  rank: number;
}

export interface LabelObstacle {
  x: number;
  y: number;
  /** Se o marcador tem selo ao lado (ocupa mais largura à direita). */
  tag?: boolean;
}

const ICON = 24;
const TAG_RIGHT = 40; // selo vai até 40px à direita do centro
const LABEL_GAP = 8;
const LABEL_HEIGHT = 24;
const PAD = 4;

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
const hit = (a: Box, b: Box) =>
  a.l < b.r + PAD && a.r + PAD > b.l && a.t < b.b + PAD && a.b + PAD > b.t;

function iconBox(o: LabelObstacle): Box {
  return {
    l: o.x - ICON / 2,
    r: o.x + (o.tag ? TAG_RIGHT : ICON / 2),
    t: o.y - ICON / 2,
    b: o.y + ICON / 2,
  };
}

/**
 * Escolhe quais nomes cabem sem cobrir outro nome nem outro ícone. O nome fica sob o ícone.
 * Os de menor `rank` entram primeiro. `obstacles` = todos os marcadores visíveis (inclusive os
 * que não mostram nome).
 */
export function pickLabels(
  candidates: readonly LabelCandidate[],
  obstacles: readonly LabelObstacle[],
): Set<string> {
  const icons = obstacles.map(iconBox);
  const placed: Box[] = [];
  const shown = new Set<string>();
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  for (const c of sorted) {
    const box: Box = {
      l: c.x - c.width / 2,
      r: c.x + c.width / 2,
      t: c.y + ICON / 2 + LABEL_GAP,
      b: c.y + ICON / 2 + LABEL_GAP + LABEL_HEIGHT,
    };
    // O ícone do próprio marcador fica acima do nome (folga de 8px), então não bloqueia.
    const blocked =
      placed.some((p) => hit(box, p)) || icons.some((i) => hit(box, i));
    if (blocked) continue;
    placed.push(box);
    shown.add(c.id);
  }
  return shown;
}
