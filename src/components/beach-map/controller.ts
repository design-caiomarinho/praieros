import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carrega o worker pelo caminho do próprio arquivo, o que quebra depois do build.
// O Vite empacota o worker (com o trecho compartilhado) e passamos a URL explícita.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  boundsOf,
  minZoomToFit,
  SALVADOR_FALLBACK,
} from '../../lib/map/bounds.ts';
import { navigationBounds } from '../../lib/map/salvador-bounds.ts';
import { applyPalette, type MapPalette } from '../../lib/map/palette.ts';
import type { MarkerData } from '../../lib/site/map-markers.ts';
import {
  createMarkerElement,
  MARKER_OFFSET,
  setMarkerState,
} from './marker-element.ts';

maplibregl.setWorkerUrl(workerUrl);

// Instância pública do OpenFreeMap, estilo Bright (docs/decisions.md).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const VIEW_PADDING = 64;

export interface BeachMapOptions {
  container: HTMLElement;
  markers: readonly MarkerData[];
  palette: MapPalette;
  onSelect(id: string): void;
  /** `ready` quando o mapa terminou de desenhar; `error` se estilo ou tiles falharem. */
  onState(state: 'loading' | 'ready' | 'error'): void;
}

export interface BeachMapController {
  zoomIn(): void;
  zoomOut(): void;
  /** Reenquadra todos os pontos, respeitando o limite de Salvador (mesma visão inicial). */
  fit(): void;
  /** Marca o marcador selecionado (ou nenhum, com null). */
  select(id: string | null): void;
  destroy(): void;
}

/** Cria o mapa. Devolve null se o estilo não puder ser carregado (estado de erro já avisado). */
export async function createBeachMap(
  opts: BeachMapOptions,
): Promise<BeachMapController | null> {
  const { container, markers, palette, onSelect, onState } = opts;
  onState('loading');

  let style;
  try {
    const res = await fetch(STYLE_URL);
    if (!res.ok) throw new Error(String(res.status));
    style = applyPalette(await res.json(), palette);
  } catch {
    onState('error');
    return null;
  }

  const bounds = boundsOf(markers);
  // O usuário não sai de Salvador: área fixa (ampliada se algum ponto ficar fora) e zoom mínimo
  // calculado para essa área caber na tela.
  const navBounds = navigationBounds(markers);
  const minZoomFor = () =>
    minZoomToFit(navBounds, {
      width: container.clientWidth,
      height: container.clientHeight,
    });
  const map = new maplibregl.Map({
    container,
    style,
    attributionControl: false,
    maxBounds: navBounds,
    minZoom: minZoomFor(),
    ...(bounds
      ? { bounds, fitBoundsOptions: { padding: VIEW_PADDING, animate: false } }
      : {
          center: [SALVADOR_FALLBACK.lng, SALVADOR_FALLBACK.lat],
          zoom: SALVADOR_FALLBACK.zoom,
        }),
  });
  // Atribuição visível (OpenStreetMap e OpenMapTiles vêm do estilo), à esquerda para não
  // colidir com os controles de zoom.
  map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    'bottom-left',
  );

  // Tela redimensionada (ou painel abrindo): recalcula o zoom mínimo.
  const resizeObserver = new ResizeObserver(() => map.setMinZoom(minZoomFor()));
  resizeObserver.observe(container);

  const entries = new Map<
    string,
    { marker: maplibregl.Marker; el: HTMLElement; data: MarkerData }
  >();
  let ready = false;
  let selectedId: string | null = null;

  map.on('error', (e) => {
    console.warn('[mapa]', e.error?.message ?? e);
    // Falha de estilo ou de tiles antes do primeiro desenho = mapa indisponível.
    if (!ready) onState('error');
  });
  map.on('load', () => {
    for (const data of markers) {
      const el = createMarkerElement(data);
      el.addEventListener('click', () => onSelect(data.id));
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'top',
        offset: [...MARKER_OFFSET.normal],
      })
        .setLngLat([data.lng, data.lat])
        .addTo(map);
      entries.set(data.id, { marker, el, data });
    }
  });
  map.once('idle', () => {
    ready = true;
    onState('ready');
  });

  const apply = (id: string | null, selected: boolean) => {
    const e = id ? entries.get(id) : undefined;
    if (!e) return;
    setMarkerState(e.el, e.data, selected);
    e.marker.setOffset([
      ...(selected ? MARKER_OFFSET.selected : MARKER_OFFSET.normal),
    ]);
    e.el.style.zIndex = selected ? '1' : '';
  };

  return {
    // Sem animação de câmera: movimento instantâneo (motion fica para depois da Fase 3).
    zoomIn: () => map.zoomIn({ duration: 0 }),
    zoomOut: () => map.zoomOut({ duration: 0 }),
    fit() {
      if (bounds)
        map.fitBounds(bounds, { padding: VIEW_PADDING, animate: false });
      else
        map.jumpTo({
          center: [SALVADOR_FALLBACK.lng, SALVADOR_FALLBACK.lat],
          zoom: SALVADOR_FALLBACK.zoom,
        });
    },
    select(id) {
      apply(selectedId, false);
      selectedId = id;
      apply(selectedId, true);
    },
    destroy: () => {
      resizeObserver.disconnect();
      map.remove();
    },
  };
}
