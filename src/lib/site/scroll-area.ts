// A área que rola de cada painel do sidebar (`[data-scroll]`): o cabeçalho fica fora dela, então a
// barra de rolagem começa abaixo dele. A ficha tem várias vistas no mesmo painel (desktop, mobile,
// Classificação); só uma está visível por vez.

/** A área que rola visível dentro do painel (ou `null`). */
export function visibleScroller(root: HTMLElement): HTMLElement | null {
  return (
    [...root.querySelectorAll<HTMLElement>('[data-scroll]')].find(
      (el) => el.getClientRects().length > 0,
    ) ?? null
  );
}

/** Volta todas as áreas que rolam do painel ao topo. */
export function resetScroll(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>('[data-scroll]')
    .forEach((el) => (el.scrollTop = 0));
}
