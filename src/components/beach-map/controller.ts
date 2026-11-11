import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carrega o worker pelo caminho do próprio arquivo, o que quebra depois do build.
// O Vite empacota o worker (com o trecho compartilhado) e passamos a URL explícita.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  boundsOf,
  containBounds,
  minZoomToFit,
  SALVADOR_FALLBACK,
} from '../../lib/map/bounds.ts';
import { navigationBounds } from '../../lib/map/salvador-bounds.ts';
import { applyPalette, type MapPalette } from '../../lib/map/palette.ts';
import type { MarkerData } from '../../lib/site/map-markers.ts';
import type { ChipStatus } from '../../lib/rules/status.ts';
import { groupBySlug } from '../../lib/map/group-markers.ts';
import { groupAriaLabel, groupBadge } from '../../lib/map/group-status.ts';
import {
  isLabelVisible,
  LABEL_MIN_ZOOM,
} from '../../lib/map/label-visibility.ts';
import { GROUP_FIT_MAX_ZOOM, isGroupSpread } from '../../lib/map/spread.ts';
import {
  createMarkerElement,
  MARKER_OFFSET,
  setLabelVisible,
  setMarkerState,
  type MarkerView,
} from './marker-element.ts';

maplibregl.setWorkerUrl(workerUrl);

// Instância pública do OpenFreeMap, estilo Bright (docs/decisions.md).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const VIEW_PADDING = 64;

export interface BeachMapOptions {
  container: HTMLElement;
  markers: readonly MarkerData[];
  palette: MapPalette;
  onSelect(sel: { slug: string; pointId?: string }): void;
  /** Clique no mapa vazio (fora de qualquer marcador). */
  onClear(): void;
  /** `ready` quando o mapa terminou de desenhar; `error` se estilo ou tiles falharem. */
  onState(state: 'loading' | 'ready' | 'error'): void;
}

export interface BeachMapController {
  zoomIn(): void;
  zoomOut(): void;
  /** Reenquadra todos os pontos, respeitando o limite de Salvador (mesma visão inicial). */
  fit(): void;
  /** Seleciona a praia (e, se o grupo estiver aberto, um ponto). Praia selecionada fica aberta em qualquer zoom. */
  select(slug: string | null, pointId?: string | null): void;
  /** Para testes e depuração. */
  getMap(): maplibregl.Map;
  destroy(): void;
}

// Uma entrada por marcador na tela. Praia de 1 ponto: `single`. Praia de 2+ pontos: marcador
// agrupado (`cluster`) e pins numerados (`pins`); só um dos dois aparece por vez.
interface Entry {
  marker: maplibregl.Marker;
  el: HTMLElement;
  status: ChipStatus;
  /** Zoom mínimo do nome (Infinity = só por seleção, foco ou hover). */
  labelMinZoom: number;
  pointId?: string;
  selected: boolean;
  hovered: boolean;
  focused: boolean;
}
interface BeachEntries {
  slug: string;
  points: MarkerData[];
  single?: Entry;
  cluster?: Entry;
  pins: Entry[];
}

/** Cria o mapa. Devolve null se o estilo não puder ser carregado (estado de erro já avisado). */
export async function createBeachMap(
  opts: BeachMapOptions,
): Promise<BeachMapController | null> {
  const { container, markers, palette, onSelect, onClear, onState } = opts;
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
  const viewport = () => ({
    width: container.clientWidth,
    height: container.clientHeight,
  });
  const minZoomFor = () => minZoomToFit(navBounds, viewport());
  const map = new maplibregl.Map({
    container,
    style,
    attributionControl: false,
    maxBounds: containBounds(navBounds, viewport()),
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
  const resizeObserver = new ResizeObserver(() => {
    map.setMaxBounds(containBounds(navBounds, viewport()));
    map.setMinZoom(minZoomFor());
  });
  resizeObserver.observe(container);

  let ready = false;
  let selectedSlug: string | null = null;
  let selectedPointId: string | null = null;
  const beaches: BeachEntries[] = [];

  function refresh(e: Entry) {
    setMarkerState(e.el, e.status, e.selected);
    e.marker.setOffset([
      ...(e.selected ? MARKER_OFFSET.selected : MARKER_OFFSET.normal),
    ]);
    e.el.style.zIndex = e.selected || e.hovered || e.focused ? '1' : '';
    setLabelVisible(
      e.el,
      isLabelVisible(
        {
          zoom: map.getZoom(),
          selected: e.selected,
          focused: e.focused,
          hovered: e.hovered,
        },
        e.labelMinZoom,
      ),
    );
  }

  function build(
    pos: { lat: number; lng: number },
    view: MarkerView,
    labelMinZoom: number,
    pointId: string | undefined,
    onClick: () => void,
  ): Entry {
    const el = createMarkerElement(view);
    const entry: Entry = {
      marker: new maplibregl.Marker({
        element: el,
        anchor: 'top',
        offset: [...MARKER_OFFSET.normal],
      })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map),
      el,
      status: view.status,
      labelMinZoom,
      pointId,
      selected: false,
      hovered: false,
      focused: false,
    };
    el.addEventListener('click', onClick);
    const track = (key: 'hovered' | 'focused', value: boolean) => () => {
      entry[key] = value;
      refresh(entry);
    };
    el.addEventListener('mouseenter', track('hovered', true));
    el.addEventListener('mouseleave', track('hovered', false));
    el.addEventListener('focus', track('focused', true));
    el.addEventListener('blur', track('focused', false));
    return entry;
  }

  /** Recalcula o que aparece: grupo aberto (selecionado ou afastado na tela), nomes e seleção. */
  function update() {
    const zoom = map.getZoom();
    for (const b of beaches) {
      const isSelected = b.slug === selectedSlug;
      if (b.single) {
        b.single.selected = isSelected;
        refresh(b.single);
      }
      if (!b.cluster) continue;
      const open = isSelected || isGroupSpread(b.points, zoom);
      b.cluster.el.hidden = open;
      if (!open) refresh(b.cluster);
      for (const pin of b.pins) {
        pin.el.hidden = !open;
        pin.selected = isSelected && pin.pointId === selectedPointId;
        if (open) refresh(pin);
      }
    }
  }

  map.on('error', (e) => {
    console.warn('[mapa]', e.error?.message ?? e);
    // Falha de estilo ou de tiles antes do primeiro desenho = mapa indisponível.
    if (!ready) onState('error');
  });
  map.on('load', () => {
    for (const g of groupBySlug(markers)) {
      const entries: BeachEntries = {
        slug: g.slug,
        points: g.points,
        pins: [],
      };
      if (g.points.length === 1) {
        const m = g.points[0];
        entries.single = build(
          m,
          {
            id: m.id,
            slug: m.slug,
            status: m.status,
            ariaLabel: m.ariaLabel,
            label: m.beachName,
            tag: null,
          },
          LABEL_MIN_ZOOM,
          m.id,
          () => onSelect({ slug: g.slug, pointId: m.id }),
        );
      } else {
        const statuses = g.points.map((p) => p.baseStatus);
        const badge = groupBadge(statuses);
        entries.cluster = build(
          g.center,
          {
            id: g.slug,
            slug: g.slug,
            status: badge.status,
            ariaLabel: groupAriaLabel(
              g.beachName,
              statuses,
              g.points.some((p) => p.status === 'outdated'),
            ),
            label: g.beachName,
            tag: { text: badge.text, divergent: badge.divergent },
          },
          LABEL_MIN_ZOOM,
          undefined,
          () => {
            // Enquadra os pontos (sem aproximar demais) e abre o grupo.
            selectedSlug = g.slug;
            selectedPointId = null;
            map.fitBounds(boundsOf(g.points)!, {
              padding: VIEW_PADDING,
              maxZoom: GROUP_FIT_MAX_ZOOM,
              animate: false,
            });
            update();
            onSelect({ slug: g.slug });
          },
        );
        g.points.forEach((m, i) => {
          const pin = build(
            m,
            {
              id: m.id,
              slug: m.slug,
              status: m.status,
              ariaLabel: m.ariaLabel,
              // O nome aparece no pin 1; nos outros, só ao selecionar, focar ou passar o mouse.
              label: m.beachName,
              tag: { text: String(m.number), divergent: false },
            },
            i === 0 ? LABEL_MIN_ZOOM : Infinity,
            m.id,
            () => onSelect({ slug: g.slug, pointId: m.id }),
          );
          pin.el.hidden = true;
          entries.pins.push(pin);
        });
      }
      beaches.push(entries);
    }
    update();
  });
  map.on('zoom', update);
  map.on('resize', update);
  map.on('click', (e) => {
    // Clique em marcador também chega aqui (os marcadores ficam dentro do mapa).
    if ((e.originalEvent.target as Element | null)?.closest('.marker')) return;
    onClear();
  });
  map.once('idle', () => {
    ready = true;
    onState('ready');
  });

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
    select(slug, pointId = null) {
      selectedSlug = slug;
      selectedPointId = pointId;
      update();
    },
    getMap: () => map,
    destroy: () => {
      resizeObserver.disconnect();
      map.remove();
    },
  };
}
