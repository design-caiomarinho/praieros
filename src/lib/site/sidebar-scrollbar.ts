// Barra de rolagem própria do sidebar (busca, ficha, Classificação e Fonte). A nativa some nesses
// painéis e esta, um contêiner (trilha) com o polegar dentro, é desenhada por cima, a 8px da
// lateral e com recuo no topo e na base (24px no desktop, 16px no mobile; ver index.astro). Assim
// o visual é igual em todos os navegadores, o que a barra nativa não permite (recuo e afastamento).
// Segue o painel visível; some quando o conteúdo cabe.

const PANE_IDS = ['search', 'panel', 'source-slot'];

export function initSidebarScrollbar(): void {
  const viewport = document.getElementById('sidebar-viewport');
  if (!viewport) return;
  const panes = PANE_IDS.map((id) => document.getElementById(id)).filter(
    (el): el is HTMLElement => !!el,
  );

  const track = document.createElement('div');
  track.className = 'sidebar__scrollbar';
  track.setAttribute('aria-hidden', 'true');
  track.hidden = true;
  const thumb = document.createElement('div');
  thumb.className = 'sidebar__scrollbar-thumb';
  track.append(thumb);
  viewport.append(track);

  const MIN_THUMB = 32;
  let frame = 0;

  const current = () => panes.find((p) => !p.hidden) ?? null;

  function update() {
    frame = 0;
    const pane = current();
    if (!pane || pane.scrollHeight <= pane.clientHeight + 1) {
      track.hidden = true;
      return;
    }
    track.hidden = false;
    const room = track.clientHeight;
    const size = Math.max(
      MIN_THUMB,
      (room * pane.clientHeight) / pane.scrollHeight,
    );
    const max = pane.scrollHeight - pane.clientHeight;
    const y = (pane.scrollTop / max) * (room - size);
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${y}px)`;
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const resize = new ResizeObserver(schedule);
  const mutate = new MutationObserver(schedule);
  panes.forEach((p) => {
    p.addEventListener('scroll', schedule, { passive: true });
    resize.observe(p);
    mutate.observe(p, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  window.addEventListener('resize', schedule);

  // Arrastar o polegar e clicar na trilha.
  track.addEventListener('pointerdown', (e) => {
    const pane = current();
    if (!pane) return;
    e.preventDefault();
    const rect = track.getBoundingClientRect();
    const size = thumb.offsetHeight;
    const max = pane.scrollHeight - pane.clientHeight;
    const room = rect.height - size;
    const onThumb = e.target === thumb;
    const grab = onThumb
      ? e.clientY - thumb.getBoundingClientRect().top
      : size / 2;
    const move = (ev: PointerEvent) => {
      const y = Math.min(Math.max(ev.clientY - rect.top - grab, 0), room);
      pane.scrollTop = (y / room) * max;
    };
    move(e);
    track.setPointerCapture(e.pointerId);
    track.addEventListener('pointermove', move);
    const stop = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', stop);
      track.removeEventListener('pointercancel', stop);
    };
    track.addEventListener('pointerup', stop);
    track.addEventListener('pointercancel', stop);
  });

  schedule();
}
