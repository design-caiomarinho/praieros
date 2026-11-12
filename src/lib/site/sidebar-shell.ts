// Sidebar do desktop: uma camada azul + painel que entram da direita por cima do mapa e hospedam
// a busca, a ficha, a Classificação e a Fonte (docs/motion.md). Quem abre e fecha cada painel
// continua mexendo só no `hidden` dele; este módulo observa isso e:
//  - abre o sidebar quando algum painel aparece e o fecha (com a saída animada) quando nenhum
//    resta; as animações de entrada e saída são CSS (`data-open`);
//  - com o sidebar já aberto, trocar de conteúdo não fecha nem reabre: o conteúdo que saiu vira um
//    "fantasma" (clone) que dissolve por cima do novo. Ao fechar, o fantasma fica parado até o
//    fim da saída, para o painel não deslizar vazio.
// No mobile (folhas inferiores) não faz nada.

const PANE_IDS = ['search', 'panel', 'source-slot'];

export function initSidebarShell(): void {
  const shell = document.getElementById('sidebar');
  const ghosts = shell?.querySelector<HTMLElement>('.sidebar__ghosts');
  if (!shell || !ghosts) return;
  const panes = PANE_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => !!el,
  );
  const desktop = window.matchMedia('(min-width: 1024px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ms = (name: string) =>
    parseFloat(getComputedStyle(shell).getPropertyValue(name)) || 0;

  let closeTimer: number | undefined;
  let prevKey: string | null = null;
  let snap: { el: HTMLElement; scroll: number } | null = null;

  const visible = () => panes.find((p) => !p.hidden) ?? null;
  // O que identifica "o conteúdo mostrado": o painel e, na ficha, a praia e a vista.
  function keyOf(p: HTMLElement | null): string | null {
    if (!p) return null;
    if (p.id !== 'panel') return p.id;
    const beach = p.querySelector<HTMLElement>('[data-beach]:not([hidden])');
    return `panel:${beach?.dataset.beach ?? ''}:${beach?.dataset.view ?? ''}`;
  }

  // Cópia só para ver: sem ids, sem foco, fora da leitura de tela. Na ficha copia só a praia
  // aberta (as outras ficam escondidas e pesariam).
  function snapshot(p: HTMLElement) {
    const el = p.cloneNode(p.id === 'panel' ? false : true) as HTMLElement;
    if (p.id === 'panel') {
      const beach = p.querySelector('[data-beach]:not([hidden])');
      if (beach) el.append(beach.cloneNode(true));
    }
    el.removeAttribute('id');
    el.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    el.hidden = false;
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('sidebar__ghost');
    return { el, scroll: p.scrollTop };
  }

  function leave(g: HTMLElement) {
    if (g.hasAttribute('data-leaving')) return;
    g.setAttribute('data-leaving', '');
    const done = () => g.remove();
    g.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, ms('--motion-duration-dissolve') + 100);
    if (reduce.matches) done();
  }

  function open() {
    window.clearTimeout(closeTimer);
    if (shell!.hasAttribute('data-open')) return;
    shell!.setAttribute('data-active', '');
    void shell!.offsetWidth; // fixa o estado de partida (fora da tela) antes de abrir
    shell!.setAttribute('data-open', '');
    document.dispatchEvent(new CustomEvent('sidebar-open'));
  }

  function close() {
    if (!shell!.hasAttribute('data-open')) return;
    shell!.removeAttribute('data-open');
    const finish = () => {
      shell!.removeAttribute('data-active');
      ghosts!.replaceChildren();
    };
    if (reduce.matches) finish();
    else {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(
        finish,
        ms('--motion-duration-panel-surface') +
          ms('--motion-delay-panel-surface-close'),
      );
    }
  }

  function sync() {
    const pane = visible();
    const key = keyOf(pane);
    if (!desktop.matches) {
      ghosts!.replaceChildren();
      snap = null;
      prevKey = key;
      return;
    }
    if (key !== prevKey && snap) {
      ghosts!.append(snap.el);
      snap.el.scrollTop = snap.scroll;
      if (pane) leave(snap.el); // trocou de conteúdo: dissolve; sem painel: fica até fechar
    }
    if (pane) {
      // Um fantasma parado de uma saída interrompida também dissolve.
      ghosts!
        .querySelectorAll<HTMLElement>('.sidebar__ghost:not([data-leaving])')
        .forEach(leave);
      open();
    } else close();
    prevKey = key;
    snap = pane ? snapshot(pane) : null;
  }

  // Só o que está dentro dos painéis (os fantasmas ficam fora: sem laço).
  const observer = new MutationObserver(sync);
  panes.forEach((p) =>
    observer.observe(p, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    }),
  );
  sync();
}
