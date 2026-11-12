// Folha inferior do mobile (abaixo de 1024px): começa com 60% do palco e pode crescer até a tela
// toda para dar mais espaço de leitura (mapa em segundo plano). Quem controla isso é só a ZONA DE
// ARRASTE, a parte de cima da folha (alça + área do título): arrastar para cima expande, para
// baixo recolhe. Fora dela, o gesto é a rolagem normal do conteúdo. A zona não inclui botões
// (fechar, voltar, campos): neles o toque funciona como sempre.
// Enquanto a folha se move (sobe ou desce) a rolagem fica travada; libera quando ela fixa.
// A altura é CSS (`data-expanded` no #sidebar, ver index.astro); aqui só se decide quando mudar.

import { cssTimeMs } from '../map/css-time.ts';

const PANE_IDS = ['search', 'panel', 'source-slot'];
/** Arrasto mínimo (px) do dedo ou do mouse para valer como gesto. */
const DRAG = 10;
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
  function set(value: boolean) {
    if (value === expanded) return;
    expanded = value;
    shell!.toggleAttribute('data-expanded', value);
    window.clearTimeout(settleTimer);
    if (reduce.matches) settle();
    else {
      shell!.setAttribute('data-moving', ''); // rolagem travada enquanto a folha se move
      const ms = cssTimeMs(
        getComputedStyle(shell!).getPropertyValue(
          '--motion-duration-panel-surface',
        ),
      );
      settleTimer = window.setTimeout(settle, ms + 100);
    }
    label();
  }
  function label() {
    handle.setAttribute('aria-expanded', String(expanded));
    handle.setAttribute(
      'aria-label',
      expanded ? 'Recolher o painel (ver o mapa)' : 'Expandir o painel',
    );
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

  // Dedo: começando na zona, o gesto é da folha (a rolagem não acontece); fora dela é a rolagem.
  let startY = 0;
  let dragging = false;
  let done = false;
  viewport.addEventListener(
    'touchstart',
    (e) => {
      const y = e.touches[0]?.clientY ?? 0;
      startY = y;
      dragging = inZone(e.target, y);
      done = false;
    },
    { passive: true },
  );
  viewport.addEventListener(
    'touchmove',
    (e) => {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault(); // sem rolar o conteúdo junto
      if (done) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY;
      if (Math.abs(dy) < DRAG) return;
      done = true;
      set(dy < 0);
    },
    { passive: false },
  );

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

  // Mouse (janela estreita no desktop): arrastar na zona, mesmo critério do dedo.
  let suppressClick = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !inZone(e.target, e.clientY)) return;
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
