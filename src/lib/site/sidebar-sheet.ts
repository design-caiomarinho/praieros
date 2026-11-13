// Folha inferior do mobile (abaixo de 1024px): começa com 60% do palco e pode crescer até a tela
// toda para dar mais espaço de leitura (mapa em segundo plano). Quem controla isso é só a ZONA DE
// ARRASTE, a parte de cima da folha (alça + área do título); fora dela o gesto é a rolagem normal
// do conteúdo. A zona não inclui botões (fechar, voltar, campos): neles o toque funciona como sempre.
//
// A alça (e a zona do título) é interativa: ao pressionar e mexer, a folha segue o dedo (ou o mouse)
// em tempo real, entre a origem (60%) e a tela toda; a origem é o limite de baixo (a folha não fica
// menor que isso; fechar é pelo X ou pelo mapa). Ao soltar, o movimento se completa pela intenção:
// um pouco acima de onde começou → sobe até a tela toda; um pouco abaixo → desce à origem.
// Na origem, um gesto de rolar para cima em qualquer ponto da folha dispara a subida completa de
// uma vez. Até o movimento acabar, a rolagem do conteúdo fica travada (`data-moving`).
// A altura final é CSS (`data-expanded` no #sidebar, ver index.astro).

import { cssTimeMs } from '../map/css-time.ts';

const PANE_IDS = ['search', 'panel', 'source-slot'];
/** Arrasto mínimo (px) para valer como arraste (e não toque). */
const DRAG = 10;
/** Soltar com esta fração da altura do palco além do ponto de partida já conta como intenção. */
const INTENT = 0.06;
/** Altura da folha na origem, como fração do palco (igual a index.astro e beach-map.astro). */
const SHEET_RATIO = 0.6;
/** Altura da zona de arraste (alça 24 + título 48 = 3 × spacing-24), medida do topo da folha. */
const ZONE = 72;
/** Vão do mapa que sobra acima da folha inteira (px), para dar a sensação de algo no fundo. */
const EXPANDED_GAP = 20;
/** Elementos interativos: dentro deles não começa arraste (fechar, voltar, campos). */
const INTERACTIVE =
  'button, a, input, select, textarea, [role="button"], [data-panel-close], [data-search-close], [data-panel-back], .close, .back';

export function initSidebarSheet(): void {
  const shell = document.getElementById('sidebar');
  const viewport = document.getElementById('sidebar-viewport');
  if (!shell || !viewport) return;
  const panes = PANE_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => !!el,
  );
  const mobile = window.matchMedia('(max-width: 1023.98px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const current = () => panes.find((p) => !p.hidden) ?? null;
  const stageHeight = () => shell.parentElement?.clientHeight ?? 0;

  // Alça: botão no topo da folha (só aparece no mobile, CSS).
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'sidebar__handle';
  handle.append(document.createElement('span'));
  viewport.append(handle);

  let expanded = false;
  // Folha na tela toda e já fixada: encosta no cabeçalho, e a linha sob o botão ativo some (CSS).
  const header = document.querySelector('header');
  function syncTop() {
    header?.toggleAttribute(
      'data-sheet-top',
      mobile.matches && expanded && !shell!.hasAttribute('data-moving'),
    );
  }
  let settleTimer: number | undefined;
  /** Fim do movimento: a rolagem do conteúdo volta. */
  function settle() {
    window.clearTimeout(settleTimer);
    shell!.removeAttribute('data-moving');
    syncTop();
  }
  shell.addEventListener('transitionend', (e) => {
    if (e.target === shell && e.propertyName === 'transform') settle();
  });
  /** A folha vai se mover (CSS anima até a altura do estado): trava a rolagem até acabar. */
  function lockUntilSettled() {
    window.clearTimeout(settleTimer);
    if (reduce.matches) return settle();
    shell!.setAttribute('data-moving', '');
    syncTop();
    const ms = cssTimeMs(
      getComputedStyle(shell!).getPropertyValue('--motion-duration-sheet-drag'),
    );
    settleTimer = window.setTimeout(settle, ms + 100);
  }
  /** De volta à origem, o conteúdo volta ao topo (sem rolagem interna lá). */
  function resetScroll() {
    panes.forEach((p) => (p.scrollTop = 0));
  }
  function label() {
    syncTop();
    handle.setAttribute('aria-expanded', String(expanded));
    handle.setAttribute(
      'aria-label',
      expanded ? 'Recolher o painel (ver o mapa)' : 'Expandir o painel',
    );
  }
  function set(value: boolean) {
    if (value === expanded) return;
    expanded = value;
    shell!.toggleAttribute('data-expanded', value);
    if (!value) resetScroll();
    lockUntilSettled();
    label();
  }
  label();

  /** O ponto (clientY) está na zona de arraste e fora de botões e campos? */
  function inZone(target: EventTarget | null, y: number): boolean {
    if (!mobile.matches || !current()) return false;
    if (target instanceof Element && target.closest('.sidebar__handle'))
      return true;
    if (target instanceof Element && target.closest(INTERACTIVE)) return false;
    return y - viewport!.getBoundingClientRect().top <= ZONE;
  }

  // Arraste em tempo real: a altura da folha segue o ponteiro (sem transição). Ao soltar, o estilo
  // inline sai e o CSS anima da altura atual até a do estado escolhido.
  let drag: {
    y0: number;
    startH: number;
    startExpanded: boolean;
    /** Começou no conteúdo (não na zona): só vale se o gesto for para cima. */
    fromContent: boolean;
  } | null = null;
  let dragged = false;
  let suppressClick = false;
  /** Deslocamento atual da folha em relação ao topo do palco (20 = folha inteira, com o vão do mapa; origem = 40%). */
  function offsetY() {
    return (
      shell!.getBoundingClientRect().top -
      (shell!.parentElement?.getBoundingClientRect().top ?? 0)
    );
  }
  /** Na origem, um gesto para cima em qualquer ponto da folha também pede a folha inteira. */
  function openable(target: EventTarget | null) {
    return (
      mobile.matches &&
      !expanded &&
      !!current() &&
      !(target instanceof Element && target.closest('.sidebar__handle'))
    );
  }
  function dragStart(y: number, fromContent = false) {
    drag = {
      y0: y,
      startH: offsetY(),
      startExpanded: expanded,
      fromContent,
    };
    dragged = false;
  }
  function dragMove(y: number) {
    if (!drag) return;
    const dy = drag.y0 - y; // para cima é positivo
    if (!dragged && Math.abs(dy) < DRAG) return;
    if (!dragged && drag.fromContent) {
      // A partir do conteúdo: para cima dispara a subida completa de uma vez; para baixo não é da folha.
      drag = null;
      if (dy > 0) {
        suppressClick = true;
        set(true);
      }
      return;
    }
    if (!dragged) {
      dragged = true;
      window.clearTimeout(settleTimer);
      shell!.setAttribute('data-moving', '');
      syncTop();
      shell!.style.transition = 'none';
    }
    const H = stageHeight();
    const o = Math.min(
      Math.max(drag.startH - dy, EXPANDED_GAP),
      H * (1 - SHEET_RATIO),
    );
    shell!.style.transform = `translateY(${o}px)`;
  }
  function dragEnd() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!dragged) return;
    const H = stageHeight();
    const o = offsetY();
    const h = -o; // quanto subiu (negativo = desceu), para comparar com o ponto de partida
    const startUp = -d.startH;
    let target: 'expanded' | 'collapsed';
    if (h - startUp > H * INTENT) target = 'expanded';
    else if (startUp - h > H * INTENT) target = 'collapsed';
    else target = d.startExpanded ? 'expanded' : 'collapsed';

    // Devolve a transição e troca o estilo inline pelo estado final: a altura anima daqui até lá.
    shell!.style.transition = '';
    shell!.style.transform = `translateY(${o}px)`;
    void shell!.offsetHeight;
    shell!.style.transform = '';
    expanded = target === 'expanded';
    shell!.toggleAttribute('data-expanded', expanded);
    if (!expanded) resetScroll();
    label();
    lockUntilSettled();
  }

  // Dedo: começando na zona, o gesto é da folha (o conteúdo não rola junto).
  viewport.addEventListener(
    'touchstart',
    (e) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (inZone(e.target, y)) dragStart(y);
      else if (openable(e.target)) dragStart(y, true);
      else drag = null;
    },
    { passive: true },
  );
  viewport.addEventListener(
    'touchmove',
    (e) => {
      if (!drag) return;
      if (e.cancelable) e.preventDefault();
      dragMove(e.touches[0]?.clientY ?? 0);
    },
    { passive: false },
  );
  viewport.addEventListener('touchend', dragEnd);
  viewport.addEventListener('touchcancel', dragEnd);

  // Mouse (janela estreita no desktop): mesmo arraste, por eventos de ponteiro.
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const inside = inZone(e.target, e.clientY);
    const content =
      !inside &&
      openable(e.target) &&
      !(e.target instanceof Element && e.target.closest(INTERACTIVE));
    if (!inside && !content) return;
    suppressClick = false;
    dragStart(e.clientY, content);
    const move = (ev: PointerEvent) => dragMove(ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragged) suppressClick = true;
      dragEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // Depois de arrastar a partir do conteúdo, o clique que o navegador gera não vale.
  viewport.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      if (e.target instanceof Element && e.target.closest('.sidebar__handle'))
        return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

  // Roda do mouse: na zona, para baixo expande e para cima recolhe; na origem, rolar para baixo em
  // qualquer ponto expande. Fora disso (folha inteira), rolagem normal.
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!inZone(e.target, e.clientY) && !(openable(e.target) && e.deltaY > 0))
        return;
      if (e.cancelable) e.preventDefault();
      set(e.deltaY > 0);
    },
    { passive: false },
  );

  // Toque (ou teclado) na alça alterna.
  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const p = current();
    if (expanded || (p && p.scrollHeight > p.clientHeight + 1)) set(!expanded);
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
