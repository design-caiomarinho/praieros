/** Há conteúdo abaixo da área visível? (tolerância de 1px por arredondamento de subpixel). */
export function hasMoreBelow(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  return scrollTop + clientHeight < scrollHeight - 1;
}

/**
 * Liga `data-scroll-more` em todo elemento com `data-scroll-fade` que ainda tem conteúdo
 * abaixo; o CSS (`src/styles/scroll-fade.css`) mostra o degradê no rodapé só nesse caso.
 */
export function initScrollFade(root: ParentNode = document): void {
  const targets = [...root.querySelectorAll<HTMLElement>('[data-scroll-fade]')];
  for (const el of targets) {
    // Leitura barata e sem animação: atualiza direto (sem rAF, que pausa em aba oculta).
    const schedule = () =>
      el.toggleAttribute(
        'data-scroll-more',
        hasMoreBelow(el.scrollTop, el.clientHeight, el.scrollHeight),
      );
    el.addEventListener('scroll', schedule, { passive: true });
    new ResizeObserver(schedule).observe(el);
    // Conteúdo trocado ou mostrado/escondido dentro do painel (ficha, resultados, bairros).
    new MutationObserver(schedule).observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    window.addEventListener('resize', schedule);
    schedule();
  }
}
