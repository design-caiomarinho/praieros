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
import {
  GROUP_FIT_MAX_ZOOM,
  isGroupSpread,
  POINT_FOCUS_ZOOM,
} from '../../lib/map/spread.ts';
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
  /**
   * Largura (px) da parte direita do mapa coberta por um painel que sobrepõe (a busca no
   * desktop). Lida a cada movimento de câmera: o enquadramento usa só a área visível à esquerda.
   */
  getCoveredRight?(): number;
}

/** Animação do reenquadramento ao abrir a busca (tokens de motion, lidos por quem chama). */
export interface RevealMotion {
  duration: number;
  delay: number;
  easing: (t: number) => number;
  zoomIn(): void;
  zoomOut(): void;
  /** Reenquadra todos os pontos, respeitando o limite de Salvador (mesma visão inicial). */
  fit(): void;
  /** Enquadra a praia como no clique no marcador (abrir a ficha é com quem chama). */
  focusBeach(slug: string): void;
  /**
   * Enquadra todas as praias dadas (ex.: as de um bairro) para mostrar de onde se trata.
   * `coveredBottom` = altura (px) do painel que cobre a parte de baixo do mapa (folha mobile).
   */
  fitBeaches(slugs: readonly string[], coveredBottom?: number): void;
  /** Seleciona a praia (e, se o grupo estiver aberto, um ponto). Praia selecionada fica aberta em qualquer zoom. */
  select(slug: string | null, pointId?: string | null): void;
  /** Para testes e depuração. */
  getMap(): maplibregl.Map;
  destroy(): void;
  /**
   * Com a busca abrindo por cima: se a praia selecionada ficar escondida, leva-a para a área
   * visível (mesma duração e curva do painel). Não mexe se ela já aparece.
   */
  revealSelected(motion: RevealMotion): void;
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
  const coveredRight = () => opts.getCoveredRight?.() ?? 0;
  /** Folga do enquadramento; à direita soma o que o painel sobreposto cobre. */
  const pad = () => ({
    top: VIEW_PADDING,
    left: VIEW_PADDING,
    bottom: VIEW_PADDING,
    right: VIEW_PADDING + coveredRight(),
  });
  /** Centro da área visível = centro do mapa menos metade do que está coberto. */
  const shift = (): [number, number] => [-coveredRight() / 2, 0];
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
  let boundsTimer: number | undefined;
  const resizeObserver = new ResizeObserver(() => {
    // O canvas acompanha o contêiner na hora (um painel abrindo muda a largura do mapa);
    // sem isso sobra uma faixa do fundo (cor do mar) junto ao painel.
    map.resize();
    // Durante a animação da busca o tamanho muda a cada quadro: só o canvas acompanha. Limites
    // e zoom mínimo são recalculados quando o tamanho assenta (senão o mapa dá zoom e some).
    window.clearTimeout(boundsTimer);
    boundsTimer = window.setTimeout(() => {
      map.setMaxBounds(containBounds(navBounds, viewport()));
      map.setMinZoom(minZoomFor());
    }, 120);
  });
  resizeObserver.observe(container);

  let ready = false;
  let selectedSlug: string | null = null;
  let selectedPointId: string | null = null;
  /** Grupo aberto por clique no marcador agrupado (sem ficha aberta). */
  let expandedSlug: string | null = null;
  const beaches: BeachEntries[] = [];

  function refresh(e: Entry) {
    setMarkerState(e.el, e.status, e.selected);
    e.marker.setOffset([
      ...(e.selected ? MARKER_OFFSET.selected : MARKER_OFFSET.normal),
    ]);
    e.el.style.zIndex = e.selected || e.hovered || e.focused ? '1' : '';
    const zoom = map.getZoom();
    const visible = isLabelVisible(
      {
        zoom,
        selected: e.selected,
        focused: e.focused,
        hovered: e.hovered,
      },
      e.labelMinZoom,
    );
    // Abaixo do zoom dos nomes, o nome que aparece por hover/foco/seleção é só uma dica
    // flutuante: não aumenta a área de clique do marcador (não cobre pins vizinhos).
    setLabelVisible(
      e.el,
      visible ? (zoom >= e.labelMinZoom ? 'shown' : 'peek') : 'hidden',
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
      const open =
        isSelected || b.slug === expandedSlug || isGroupSpread(b.points, zoom);
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
          () => {
            // Aproxima o ponto (nunca afasta) e abre a ficha.
            map.easeTo({
              center: [m.lng, m.lat],
              zoom: Math.max(map.getZoom(), POINT_FOCUS_ZOOM),
              duration: 0,
            });
            onSelect({ slug: g.slug, pointId: m.id });
          },
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
            tag: { text: badge.text },
          },
          LABEL_MIN_ZOOM,
          undefined,
          () => {
            // Primeiro passo: só enquadra os pontos (sem aproximar demais) e abre o grupo
            // em pins numerados. A ficha NÃO abre; ela abre ao clicar num pin.
            expandedSlug = g.slug;
            map.fitBounds(boundsOf(g.points)!, {
              padding: pad(),
              maxZoom: GROUP_FIT_MAX_ZOOM,
              animate: false,
            });
            update();
          },
        );
        g.points.forEach((m) => {
          const pin = build(
            m,
            {
              id: m.id,
              slug: m.slug,
              status: m.status,
              ariaLabel: m.ariaLabel,
              // Nome só no pin selecionado (ou com foco/hover); em qualquer zoom.
              label: m.beachName,
              tag: { text: String(m.number) },
            },
            Infinity,
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
    // Clique no vazio também recolhe o grupo aberto por clique (sem ficha).
    if (expandedSlug) {
      expandedSlug = null;
      update();
    }
    onClear();
  });
              offset: shift(),
  map.once('idle', () => {
    ready = true;
    onState('ready');
  });

  return {
    // Sem animação de câmera: movimento instantâneo (motion fica para depois da Fase 3).
    zoomIn: () => map.zoomIn({ duration: 0 }),
    zoomOut: () => map.zoomOut({ duration: 0 }),
    fit() {
      if (bounds) map.fitBounds(bounds, { padding: pad(), animate: false });
      else
        map.jumpTo({
          center: [SALVADOR_FALLBACK.lng, SALVADOR_FALLBACK.lat],
          zoom: SALVADOR_FALLBACK.zoom,
        });
    },
    focusBeach(slug) {
      // Mesmo enquadramento do clique no marcador: 1 ponto aproxima (nunca afasta);
      // 2+ pontos enquadra o grupo e o abre em pins.
      const entry = beaches.find((b) => b.slug === slug);
      if (!entry) return;
      if (entry.points.length === 1) {
        const m = entry.points[0];
        map.easeTo({
          center: [m.lng, m.lat],
          zoom: Math.max(map.getZoom(), POINT_FOCUS_ZOOM),
          duration: 0,
        });
        return;
      }
      expandedSlug = slug;
      map.fitBounds(boundsOf(entry.points)!, {
        padding: pad(),
        maxZoom: GROUP_FIT_MAX_ZOOM,
        animate: false,
      });
      update();
    },
    fitBeaches(slugs, coveredBottom = 0) {
      const points = beaches
        .filter((b) => slugs.includes(b.slug))
        .flatMap((b) => b.points);
      const bounds = boundsOf(points);
      if (!bounds) return; // nenhuma praia do grupo está no mapa: não mexe na câmera
      map.fitBounds(bounds, {
        padding: {
          ...pad(),
          bottom: VIEW_PADDING + coveredBottom,
        },
        maxZoom: GROUP_FIT_MAX_ZOOM,
        animate: false,
      });
      update();
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
          offset: shift(),
    revealSelected({ duration, delay, easing }) {
      const entry = beaches.find((b) => b.slug === selectedSlug);
      if (!entry) return;
      const m =
        entry.points.find((p) => p.id === selectedPointId) ?? entry.points[0];
      if (!m) return;
      window.setTimeout(() => {
        // Medido depois do atraso (a ficha pode ter saído e o mapa alargado). Se a busca já
        // fechou nesse meio tempo, ou a praia já aparece, não há o que revelar.
        const covered = coveredRight();
        if (covered <= 0) return;
        const x = map.project([m.lng, m.lat]).x;
        const edge = VIEW_PADDING / 2;
        if (x >= edge && x <= container.clientWidth - covered - edge) return;
        map.easeTo({
          center: [m.lng, m.lat],
          offset: shift(),
          duration,
          easing,
        });
      }, delay);
    },
