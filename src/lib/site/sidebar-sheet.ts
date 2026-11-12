// Folha inferior do mobile (abaixo de 1024px): começa com 60% do palco e pode crescer até a tela
// toda para dar mais espaço de leitura (mapa em segundo plano). Quem controla isso é só a ZONA DE
// ARRASTE, a parte de cima da folha (alça + área do título); fora dela o gesto é a rolagem normal
// do conteúdo. A zona não inclui botões (fechar, voltar, campos): neles o toque funciona como sempre.
//
// A alça é interativa: ao pressionar e mexer, a folha segue o dedo (ou o mouse) em tempo real. Ao
// soltar, o movimento se completa pela intenção: soltou um pouco acima de onde começou → sobe até a
// tela toda; um pouco abaixo → desce à posição de origem (60%); muito abaixo → fecha o painel (o
// mesmo que o X). O resto do caminho é animado e, até ele acabar, a rolagem do conteúdo fica
// travada (`data-moving`). A altura final é CSS (`data-expanded` no #sidebar, ver index.astro).

import { cssTimeMs } from '../map/css-time.ts';

const PANE_IDS = ['search', 'panel', 'source-slot'];
/** Arrasto mínimo (px) para valer como arraste (e não toque). */
const DRAG = 10;
/** Soltar com esta fração da altura do palco além do ponto de partida já conta como intenção. */
const INTENT = 0.06;
/** Soltar com a folha abaixo desta fração da altura do palco fecha o painel. */
const DISMISS_BELOW = 0.45;
/** Altura da zona de arraste (alça 24 + título 48 = 3 × spacing-24), medida do topo da folha. */
const ZONE = 72;
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
  let settleTimer: number | undefined;
  /** Fim do movimento: a rolagem do conteúdo volta. */
  function settle() {
    window.clearTimeout(settleTimer);
    shell!.removeAttribute('data-moving');
  }
  shell.addEventListener('transitionend', (e) => {
    if (e.target === shell && e.propertyName === 'height') settle();
  });
  /** A folha vai se mover (CSS anima até a altura do estado): trava a rolagem até acabar. */
  function lockUntilSettled() {
    window.clearTimeout(settleTimer);
    if (reduce.matches) return settle();
    shell!.setAttribute('data-moving', '');
    const ms = cssTimeMs(
      getComputedStyle(shell!).getPropertyValue(
        '--motion-duration-panel-surface',
      ),
    );
    settleTimer = window.setTimeout(settle, ms + 100);
  }
  function label() {
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

  /** Fecha o painel aberto, como o X dele (ficha, Classificação, Fonte ou busca). */
  function dismiss() {
    const p = current();
    const close = [
      ...(p?.querySelectorAll<HTMLElement>(
        '[data-panel-close], [data-search-close]',
      ) ?? []),
    ].find((el) => el.offsetParent !== null);
    if (close) close.click();
    else
      document
        .getElementById('beach-map')
        ?.dispatchEvent(new CustomEvent('map-clear', { bubbles: true }));
  }

  // Arraste em tempo real: a altura da folha segue o ponteiro (sem transição). Ao soltar, o estilo
  // inline sai e o CSS anima da altura atual até a do estado escolhido.
  let drag: { y0: number; startH: number; startExpanded: boolean } | null =
    null;
  let dragged = false;
  function dragStart(y: number) {
    drag = {
      y0: y,
      startH: shell!.getBoundingClientRect().height,
      startExpanded: expanded,
    };
    dragged = false;
  }
  function dragMove(y: number) {
    if (!drag) return;
    const dy = drag.y0 - y; // para cima é positivo
    if (!dragged && Math.abs(dy) < DRAG) return;
    if (!dragged) {
      dragged = true;
      window.clearTimeout(settleTimer);
      shell!.setAttribute('data-moving', '');
      shell!.style.transition = 'none';
    }
    const H = stageHeight();
    shell!.style.height = `${Math.min(Math.max(drag.startH + dy, H * 0.3), H)}px`;
  }
  function dragEnd() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!dragged) return;
    const H = stageHeight();
    const h = shell!.getBoundingClientRect().height;
    let target: 'dismiss' | 'expanded' | 'collapsed';
    if (h < H * DISMISS_BELOW) target = 'dismiss';
    else if (h - d.startH > H * INTENT) target = 'expanded';
    else if (d.startH - h > H * INTENT) target = 'collapsed';
    else target = d.startExpanded ? 'expanded' : 'collapsed';

    if (target === 'dismiss') {
      // Fecha na altura em que foi solta (sem animar a altura de volta aos 60%, o que embolava com
      // a saída). O tamanho inicial só volta depois que o sidebar sai de cena (ou reabre).
      expanded = false;
      shell!.removeAttribute('data-expanded');
      label();
      const restore = new MutationObserver(() => {
        if (shell!.hasAttribute('data-active')) return;
        restore.disconnect();
        shell!.style.height = '';
        shell!.style.transition = '';
        settle();
      });
      restore.observe(shell!, {
        attributes: true,
        attributeFilter: ['data-active', 'data-open'],
      });
      dismiss();
      return;
    }

    // Devolve a transição e troca o estilo inline pelo estado final: a altura anima daqui até lá.
    shell!.style.transition = '';
    shell!.style.height = `${h}px`;
    void shell!.offsetHeight;
    shell!.style.height = '';
    expanded = target === 'expanded';
    shell!.toggleAttribute('data-expanded', expanded);
    label();
    lockUntilSettled();
  }

  // Dedo: começando na zona, o gesto é da folha (o conteúdo não rola junto).
  viewport.addEventListener(
    'touchstart',
    (e) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (inZone(e.target, y)) dragStart(y);
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
  let suppressClick = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !inZone(e.target, e.clientY)) return;
    dragStart(e.clientY);
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

  // Roda do mouse sobre a zona: para baixo expande, para cima recolhe. Fora dela, rolagem normal.
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!inZone(e.target, e.clientY)) return;
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
