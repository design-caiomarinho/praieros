// Folha inferior do mobile (abaixo de 1024px): começa com 60% do palco. Um gesto para cima (arrastar,
// roda) primeiro dá destaque à folha: ela cresce até a tela toda SEM rolar o conteúdo (rolagem
// travada enquanto está recolhida, ver index.astro); só então o usuário rola. Com o conteúdo no topo,
// um gesto para baixo recolhe a folha (de volta aos 60%, mapa à vista). A alça (drag handle) no
// topo faz o mesmo: toque alterna, arrastar para cima expande e para baixo recolhe.
// A altura é CSS (`data-expanded` no #sidebar, ver index.astro); aqui só se decide quando mudar.

import { cssTimeMs } from '../map/css-time.ts';

const PANE_IDS = ['search', 'panel', 'source-slot'];
/** Arrasto mínimo (px) do dedo para valer como gesto. */
const DRAG = 10;

export function initSidebarSheet(): void {
  const shell = document.getElementById('sidebar');
  const viewport = document.getElementById('sidebar-viewport');
  if (!shell || !viewport) return;
  const panes = PANE_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => !!el,
  );
  const mobile = window.matchMedia('(max-width: 1023.98px)');
  const current = () => panes.find((p) => !p.hidden) ?? null;

  // Alça: botão no topo da folha (só aparece no mobile, CSS).
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'sidebar__handle';
  handle.append(document.createElement('span'));
  viewport.append(handle);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let expanded = false;
  let settleTimer: number | undefined;
  /** Rolagem só depois da folha fixar na tela toda (fim da animação); recolher trava na hora. */
  function settle() {
    window.clearTimeout(settleTimer);
    shell!.toggleAttribute('data-settled', expanded);
  }
  shell.addEventListener('transitionend', (e) => {
    if (e.target === shell && e.propertyName === 'height') settle();
  });
  function set(value: boolean) {
    if (value === expanded && shell!.hasAttribute('data-expanded') === value)
      return;
    expanded = value;
    shell!.toggleAttribute('data-expanded', value);
    window.clearTimeout(settleTimer);
    shell!.removeAttribute('data-settled'); // travada enquanto a folha sobe (ou desce)
    if (value) {
      const ms = cssTimeMs(
        getComputedStyle(shell!).getPropertyValue(
          '--motion-duration-panel-surface',
        ),
      );
      settleTimer = window.setTimeout(settle, reduce.matches ? 0 : ms + 100);
    }
    handle.setAttribute('aria-expanded', String(value));
    handle.setAttribute(
      'aria-label',
      value ? 'Recolher o painel (ver o mapa)' : 'Expandir o painel',
    );
  }
  set(false);

  const overflows = (p: HTMLElement) => p.scrollHeight > p.clientHeight + 1;

  // Roda do mouse: para baixo expande (sem rolar); com o conteúdo no topo, para cima recolhe.
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!mobile.matches) return;
      const p = current();
      if (!p) return;
      if (!expanded && e.deltaY > 0 && overflows(p)) set(true);
      else if (expanded && e.deltaY < 0 && p.scrollTop <= 0) set(false);
    },
    { passive: true },
  );

  // Dedo: o gesto vale pela posição inicial. Recolhida, arrastar para cima expande; expandida e
  // com o conteúdo no topo no início do gesto, arrastar para baixo recolhe.
  let startY = 0;
  let startTop = 0;
  let handled = false;
  viewport.addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0]?.clientY ?? 0;
      startTop = current()?.scrollTop ?? 0;
      handled = false;
    },
    { passive: true },
  );
  viewport.addEventListener(
    'touchmove',
    (e) => {
      if (!mobile.matches || handled) return;
      const p = current();
      if (!p) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY;
      const onHandle = (e.target as Element).closest('.sidebar__handle');
      if (!expanded && dy < -DRAG && (onHandle || overflows(p))) {
        handled = true;
        set(true);
      } else if (expanded && dy > DRAG && (onHandle || startTop <= 0)) {
        handled = true;
        set(false);
      }
    },
    { passive: true },
  );

  // Mouse (janela estreita no desktop): arrastar a alça, mesmo critério do dedo.
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !mobile.matches) return;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      if (moved || Math.abs(dy) < DRAG) return;
      moved = true;
      set(dy < 0);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) suppressClick = true;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  let suppressClick = false;

  // Toque (ou teclado) na alça alterna.
  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const p = current();
    if (expanded || (p && overflows(p))) set(!expanded);
  });

  // Fechou o sidebar ou trocou de painel: volta ao tamanho inicial.
  new MutationObserver(() => {
    if (!shell.hasAttribute('data-open')) set(false);
  }).observe(shell, { attributes: true, attributeFilter: ['data-open'] });
  const swap = new MutationObserver(() => set(false));
  panes.forEach((p) =>
    swap.observe(p, { attributes: true, attributeFilter: ['hidden'] }),
  );
  mobile.addEventListener('change', () => set(false));
}
