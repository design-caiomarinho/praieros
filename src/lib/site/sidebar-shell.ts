// Sidebar do desktop: uma camada azul + painel que entram da direita por cima do mapa e hospedam
// a busca, a ficha, a Classificação e a Fonte (docs/motion.md). Quem abre e fecha cada painel
// continua mexendo só no `hidden` dele; este módulo observa isso e:
//  - abre o sidebar quando algum painel aparece e o fecha (com a saída animada) quando nenhum
//    resta; as animações de entrada e saída são CSS (`data-open`);
//  - com o sidebar já aberto, trocar de conteúdo não fecha nem reabre: o conteúdo que saiu vira um
//    "fantasma" (clone) que dissolve por cima do novo. Ao fechar, o fantasma fica parado até o
//    fim da saída, para o painel não deslizar vazio.
// O botão de informação do cabeçalho (Fonte e como ler) fica com a aparência de desabilitado
// (`data-engaged`) como o de busca: liga quando o painel está a 50% em cena e desliga também a
// 50% na saída; trocando de painel com o sidebar aberto, na hora.
// No mobile é o mesmo sidebar, na vertical (folha inferior): só o CSS muda.

import { halfwayTime } from '../map/cubic-bezier.ts';

const PANE_IDS = ['search', 'panel', 'source-slot'];

export function initSidebarShell(): void {
  const shell = document.getElementById('sidebar');
  const ghosts = shell?.querySelector<HTMLElement>('.sidebar__ghosts');
  if (!shell || !ghosts) return;
  const panes = PANE_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => !!el,
  );
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ms = (name: string) =>
    parseFloat(getComputedStyle(shell).getPropertyValue(name)) || 0;

  const infoButton = document.querySelector<HTMLElement>(
    'header a[href="#fonte"]',
  );
  let engageTimer: number | undefined;
  let engagedTarget = false;
  /** Liga/desliga a aparência de desabilitado do botão de Fonte, no tempo do painel. */
  function engageInfo(on: boolean, wasOpen: boolean, swapping: boolean) {
    if (on === engagedTarget || !infoButton) return;
    engagedTarget = on;
    window.clearTimeout(engageTimer);
    const apply = () => infoButton.toggleAttribute('data-engaged', on);
    const half = halfwayTime(
      getComputedStyle(shell!).getPropertyValue('--motion-easing-panel'),
    );
    const after = on
      ? wasOpen
        ? 0
        : ms('--motion-delay-panel') + half * ms('--motion-duration-panel')
      : swapping
        ? 0
        : half * ms('--motion-duration-panel');
    if (after <= 0 || reduce.matches) apply();
    else engageTimer = window.setTimeout(apply, after);
  }

  let closeTimer: number | undefined;
  let prevKey: string | null = null;
  let snap: { el: HTMLElement; scroll: number } | null = null;

  const visible = () => panes.find((p) => !p.hidden) ?? null;
  // O que identifica "o conteúdo mostrado": o painel e, na ficha, a praia e a vista.
  function keyOf(p: HTMLElement | null): string | null {
    if (!p) return null;
    if (p.id === 'search') {
      // Estados da busca (sem digitação): sugestões, resultados, sem resultado, vista de bairro.
      const on = (sel: string) => !p.querySelector<HTMLElement>(sel)?.hidden;
      return `search:${on('[data-found]')}:${on('[data-empty]')}:${on('[data-hoods]')}:${on('[data-search-back]')}`;
    }
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
    window.clearTimeout(pendingClose);
    pendingClose = undefined;
    if (shell!.hasAttribute('data-open')) return;
    shell!.setAttribute('data-active', '');
    void shell!.offsetWidth; // fixa o estado de partida (fora da tela) antes de abrir
    shell!.setAttribute('data-open', '');
    document.dispatchEvent(new CustomEvent('sidebar-open'));
  }

  let pendingClose: number | undefined;
  function close(afterBanner = false) {
    if (!shell!.hasAttribute('data-open')) return;
    // A faixa de aviso sai primeiro (index.astro): o painel começa a sair quando ela some atrás do
    // cabeçalho (50% do trajeto, que vai além do topo).
    if (
      !afterBanner &&
      document.querySelector('.map-banner[data-leaving]') &&
      !reduce.matches &&
      !window.matchMedia('(max-width: 1023.98px)').matches
    ) {
      if (pendingClose === undefined)
        pendingClose = window.setTimeout(
          () => {
            pendingClose = undefined;
            if (!visible()) close(true);
          },
          halfwayTime(
            getComputedStyle(shell!).getPropertyValue(
              '--motion-easing-pin-label',
            ),
          ) * ms('--motion-duration-pin-label'),
        );
      return;
    }
    shell!.removeAttribute('data-open');
    document.dispatchEvent(new CustomEvent('sidebar-close'));
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
    if (key !== prevKey && snap) {
      ghosts!.append(snap.el);
      snap.el.scrollTop = snap.scroll;
      if (pane) leave(snap.el); // trocou de conteúdo: dissolve; sem painel: fica até fechar
    }
    engageInfo(
      pane?.id === 'source-slot',
      shell!.hasAttribute('data-open'),
      !!pane,
    );
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
