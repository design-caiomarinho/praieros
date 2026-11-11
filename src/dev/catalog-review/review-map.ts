import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './pins.css';
// Mesmo ajuste do mapa do site: o Vite empacota o worker e passamos a URL explícita.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { boundsOf, SALVADOR_FALLBACK } from '../../lib/map/bounds.ts';
import { applyPalette, type MapPalette } from '../../lib/map/palette.ts';

maplibregl.setWorkerUrl(workerUrl);

// Mesmo estilo do mapa do site (docs/decisions.md). Sem maxBounds: dá para ajustar nas bordas.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const FRAME_PADDING = 64;
/** Arrasto menor que isso (em pixels) é tratado como toque e não grava. */
const MIN_DRAG_PX = 3;
/** Zoom de um ponto único ou de pontos muito próximos: mostra a faixa de areia e as ruas vizinhas. */
export const SINGLE_POINT_ZOOM = 17;

const SYMBOLS = {
  verified: '✓',
  auto: '≈',
  pending: '?',
  proposed: '?',
} as const;

export interface ReviewPin {
  /** `praia|código`. */
  id: string;
  /** Número do ponto na praia (1, 2, 3…). */
  number: number;
  /** Nome da praia, só em um pin por praia. */
  label: string | null;
  lat: number;
  lng: number;
  /** proposed/verified: página de revisão. auto/pending: visão geral (automático; aguardando aprovação). */
  state: 'proposed' | 'verified' | 'auto' | 'pending';
  ariaLabel: string;
}

export interface ReviewMapOptions {
  container: HTMLElement;
  palette: MapPalette;
  /** false = só visualização (visão geral). */
  draggable?: boolean;
  onPinSelect(id: string): void;
  onPinMove(id: string, lat: number, lng: number): void;
  onMapClick(lat: number, lng: number): void;
}

export interface ReviewMap {
  setPins(pins: readonly ReviewPin[]): void;
  /** Destaca esses pins (praia inteira ou só um ponto). */
  highlight(ids: ReadonlySet<string>): void;
  /** Enquadra as posições, sem animação. Uma só posição = zoom próximo. */
  frame(coords: readonly { lat: number; lng: number }[]): void;
  setPlacing(on: boolean): void;
}

/** Cria o mapa de revisão. Lança erro se o estilo não carregar. */
export async function createReviewMap(
  opts: ReviewMapOptions,
): Promise<ReviewMap> {
  const res = await fetch(STYLE_URL);
  if (!res.ok) throw new Error(`Estilo do mapa: ${res.status}`);
  const style = applyPalette(await res.json(), opts.palette);
  const map = new maplibregl.Map({
    container: opts.container,
    style,
    attributionControl: false,
    center: [SALVADOR_FALLBACK.lng, SALVADOR_FALLBACK.lat],
    zoom: SALVADOR_FALLBACK.zoom,
  });
  map.addControl(new maplibregl.NavigationControl({}), 'top-right');
  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    'bottom-left',
  );

  let markers: { id: string; marker: maplibregl.Marker; el: HTMLElement }[] =
    [];
  let justDragged = false;

  map.on('click', (e) => opts.onMapClick(e.lngLat.lat, e.lngLat.lng));

  return {
    setPins(pins) {
      for (const m of markers) m.marker.remove();
      markers = pins.map((pin) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `pin pin--${pin.state}`;
        el.dataset.pinId = pin.id;
        el.setAttribute('aria-label', pin.ariaLabel);
        // Cor + símbolo + número: o estado nunca vai só na cor.
        const symbol = SYMBOLS[pin.state];
        el.innerHTML = `<span class="pin__badge"><span aria-hidden="true">${symbol}</span><span class="pin__num"></span></span>${
          pin.label ? '<span class="pin__label"></span>' : ''
        }`;
        el.querySelector('.pin__num')!.textContent = String(pin.number);
        if (pin.label) el.querySelector('.pin__label')!.textContent = pin.label;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (!justDragged) opts.onPinSelect(pin.id);
        });
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'top',
          offset: [0, -12],
          draggable: opts.draggable ?? true,
        })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
        let origin = { x: 0, y: 0 };
        marker.on('dragstart', () => {
          justDragged = true;
          origin = map.project(marker.getLngLat());
        });
        marker.on('dragend', () => {
          const end = map.project(marker.getLngLat());
          if (Math.hypot(end.x - origin.x, end.y - origin.y) < MIN_DRAG_PX) {
            // Toque ou tremida, não um ajuste: volta para a posição gravada e não grava nada.
            marker.setLngLat([pin.lng, pin.lat]);
          } else {
            const { lat, lng } = marker.getLngLat();
            opts.onPinMove(pin.id, lat, lng);
          }
          setTimeout(() => (justDragged = false), 0);
        });
        return { id: pin.id, marker, el };
      });
    },
    highlight(ids) {
      for (const m of markers) {
        const on = ids.has(m.id);
        m.el.classList.toggle('pin--selected', on);
        m.el.style.zIndex = on ? '1' : '';
      }
    },
    frame(coords) {
      if (coords.length === 0) return;
      const pts = coords.map((c) => ({ lat: c.lat, lng: c.lng }));
      const b = boundsOf(pts);
      const single =
        pts.length === 1 || (b && b[0][0] === b[1][0] && b[0][1] === b[1][1]);
      if (single || !b) {
        map.jumpTo({
          center: [pts[0]!.lng, pts[0]!.lat],
          zoom: SINGLE_POINT_ZOOM,
        });
      } else {
        map.fitBounds(b, {
          padding: FRAME_PADDING,
          maxZoom: SINGLE_POINT_ZOOM,
          animate: false,
        });
      }
    },
    setPlacing(on) {
      map.getCanvas().style.cursor = on ? 'crosshair' : '';
    },
  };
}
