// Folha inferior do mobile (abaixo de 1024px): começa com 60% do palco (como hoje). Rolando o
// conteúdo para baixo, ela cresce para cima até preencher a tela toda (mais espaço para ler, o
// mapa fica em segundo plano); rolando de volta ao topo, volta ao tamanho inicial. A altura é
// CSS (`data-expanded` no #sidebar, ver index.astro); aqui só se decide quando mudar.
//
// A decisão vem de gestos do usuário (roda, arrastar), não só da posição da rolagem: ao crescer,
// um conteúdo que passa a caber inteiro zera o scrollTop sozinho, e isso não pode fechar a folha.

const PANE_IDS = ['search', 'panel', 'source-slot'];
/** Rolagem (px) a partir da qual a folha cresce. */
const EXPAND_AT = 8;
/** Perto do topo (px): rolar para cima aqui devolve a folha ao tamanho inicial. */
const COLLAPSE_AT = 24;
/** Arrasto mínimo (px) do dedo para valer como gesto. */
const DRAG = 10;
/** Quanto tempo (ms) uma rolagem conta como feita pelo usuário depois do último gesto. */
const GESTURE_MS = 200;

export function initSidebarSheet(): void {
  const shell = document.getElementById('sidebar');
  const viewport = document.getElementById('sidebar-viewport');
  if (!shell || !viewport) return;
  const panes = PANE_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => !!el,
  );
  const mobile = window.matchMedia('(max-width: 1023.98px)');
  const current = () => panes.find((p) => !p.hidden) ?? null;

  let expanded = false;
  let lastTop = 0;
  let lastGesture = 0;

  function set(value: boolean) {
    if (expanded === value) return;
    expanded = value;
    shell!.toggleAttribute('data-expanded', value);
  }
  const reset = () => {
    set(false);
    lastTop = 0;
  };

  const overflows = (p: HTMLElement) => p.scrollHeight > p.clientHeight + 1;
  const nearTop = (p: HTMLElement) => p.scrollTop <= COLLAPSE_AT;

  panes.forEach((p) =>
    p.addEventListener(
      'scroll',
      () => {
        if (!mobile.matches || p !== current()) return;
        const top = p.scrollTop;
        const up = top < lastTop;
        lastTop = top;
        if (!expanded && top > EXPAND_AT && !up) set(true);
        else if (
          expanded &&
          up &&
          top <= COLLAPSE_AT &&
          performance.now() - lastGesture < GESTURE_MS
        )
          set(false);
      },
      { passive: true },
    ),
  );

  // Gestos: roda do mouse e arrastar com o dedo.
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!mobile.matches) return;
      const p = current();
      if (!p) return;
      lastGesture = performance.now();
      if (e.deltaY > 0 && !expanded && overflows(p)) set(true);
      else if (e.deltaY < 0 && expanded && nearTop(p)) set(false);
    },
    { passive: true },
  );
  let startY = 0;
  viewport.addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0]?.clientY ?? 0;
      lastGesture = performance.now();
    },
    { passive: true },
  );
  viewport.addEventListener(
    'touchmove',
    (e) => {
      if (!mobile.matches) return;
      const p = current();
      if (!p) return;
      lastGesture = performance.now();
      const dy = (e.touches[0]?.clientY ?? 0) - startY;
      if (dy < -DRAG && !expanded && overflows(p)) set(true);
      else if (dy > DRAG && expanded && nearTop(p)) set(false);
    },
    { passive: true },
  );

  // Fechou o sidebar ou trocou de painel: volta ao tamanho inicial.
  new MutationObserver(() => {
    if (!shell.hasAttribute('data-open')) reset();
  }).observe(shell, { attributes: true, attributeFilter: ['data-open'] });
  const swap = new MutationObserver(reset);
  panes.forEach((p) =>
    swap.observe(p, { attributes: true, attributeFilter: ['hidden'] }),
  );
  mobile.addEventListener('change', reset);
}
