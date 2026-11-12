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
  LABEL_FLOOR_ZOOM,
  pickLabels,
  type LabelCandidate,
  type LabelObstacle,
} from '../../lib/map/label-visibility.ts';
import {
  GROUP_FIT_MAX_ZOOM,
  isGroupOpen,
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
  /**
   * Parte do mapa coberta por um painel que sobrepõe (px): à direita no desktop (sidebar) ou
   * embaixo no mobile (folha). Lida a cada movimento de câmera: o enquadramento usa só a área
   * visível.
   */
  getCovered?(): { right: number; bottom: number };
  /** Duração e curva dos movimentos de câmera (tokens do painel, lidos por quem chama). */
  getMotion?(): { duration: number; easing: (t: number) => number };
}

export interface BeachMapController {
  zoomIn(): void;
  zoomOut(): void;
  /** Reenquadra todos os pontos, respeitando o limite de Salvador (mesma visão inicial). */
  fit(): void;
  /** Enquadra a praia como no clique no marcador (abrir a ficha é com quem chama). */
  focusBeach(slug: string): void;
  /** Enquadra todas as praias dadas (ex.: as de um bairro) para mostrar de onde se trata. */
  fitBeaches(slugs: readonly string[]): void;
  /** Seleciona a praia (e, se o grupo estiver aberto, um ponto). Praia selecionada fica aberta em qualquer zoom. */
  select(slug: string | null, pointId?: string | null): void;
  /**
   * Com o sidebar abrindo por cima: se a praia selecionada ficar escondida, leva-a para a área
   * visível (mesma duração e curva do painel). Não mexe se ela já aparece.
   */
  revealSelected(): void;
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
  /** Nome por espaço livre (false para pins: só por seleção, foco ou hover). */
  autoLabel: boolean;
  /** Resultado da última disposição: o nome cabe sem cobrir outros. */
  labelOk: boolean;
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
  const covered = () => opts.getCovered?.() ?? { right: 0, bottom: 0 };
  /** Folga do enquadramento; soma o que o painel sobreposto cobre (direita ou embaixo). */
  const pad = () => {
    const c = covered();
    return {
      top: VIEW_PADDING,
      left: VIEW_PADDING,
      bottom: VIEW_PADDING + c.bottom,
      right: VIEW_PADDING + c.right,
    };
  };
  /** Centro da área visível = centro do mapa menos metade do que está coberto. */
  const shift = (): [number, number] => {
    const c = covered();
    return [-c.right / 2, -c.bottom / 2];
  };
  /** Movimento suave da câmera: duração e curva do painel (sem animação com movimento reduzido). */
  const motion = () =>
    opts.getMotion?.() ?? { duration: 0, easing: (t: number) => t };

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
    e.el.style.zIndex = e.selected || e.hovered || e.focused ? '1' : '';
    const visible = isLabelVisible(
      {
        zoom: 0,
        selected: e.selected,
        focused: e.focused,
        hovered: e.hovered,
      },
      e.labelOk ? 0 : Infinity,
    );
    // Sem espaço para o nome, o que aparece por hover/foco/seleção é só uma dica flutuante:
    // não aumenta a área de clique do marcador (não cobre pins vizinhos).
    setLabelVisible(e.el, visible ? (e.labelOk ? 'shown' : 'peek') : 'hidden');
  }

  function build(
    pos: { lat: number; lng: number },
    view: MarkerView,
    autoLabel: boolean,
    pointId: string | undefined,
    onClick: () => void,
  ): Entry {
    const el = createMarkerElement(view);
    const entry: Entry = {
      marker: new maplibregl.Marker({
        element: el,
        anchor: 'top',
        offset: [...MARKER_OFFSET],
      })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map),
      el,
      status: view.status,
      autoLabel,
      labelOk: false,
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
      // Aberto por clique ou seleção só enquanto os pins não se sobrepõem: ao afastar o zoom o
      // grupo volta a ser um marcador só (nunca sobram pontos soltos do mesmo local).
      const open = isGroupOpen(
        b.points,
        zoom,
        isSelected || b.slug === expandedSlug,
      );
      b.cluster.el.hidden = open;
      b.cluster.selected = isSelected && !open;
      for (const pin of b.pins) {
        pin.el.hidden = !open;
        pin.selected = isSelected && pin.pointId === selectedPointId;
      }
    }
    layoutLabels(zoom);
    for (const b of beaches) {
      if (b.single) refresh(b.single);
      if (b.cluster && !b.cluster.el.hidden) refresh(b.cluster);
      for (const pin of b.pins) if (!pin.el.hidden) refresh(pin);
    }
  }

  const measure = document.createElement('canvas').getContext('2d');
  const widthCache = new Map<string, number>();
  /** Largura do nome (texto + padding + borda), medida com a fonte real do rótulo. */
  function labelWidth(e: Entry): number {
    const label = e.el.querySelector<HTMLElement>('.marker__label');
    const text = label?.textContent ?? '';
    const hit = widthCache.get(text);
    if (hit !== undefined) return hit;
    let w = text.length * 7;
    if (label && measure) {
      const cs = getComputedStyle(label);
      measure.font =
        cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      w = measure.measureText(text).width;
      w += parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2;
    }
    widthCache.set(text, w);
    return w;
  }

  /** Decide quais nomes cabem: só marcadores na tela, de zoom `LABEL_FLOOR_ZOOM` para cima. */
  function layoutLabels(zoom: number) {
    const { clientWidth: cw, clientHeight: ch } = container;
    const margin = 120;
    const candidates: LabelCandidate[] = [];
    const obstacles: LabelObstacle[] = [];
    const all: Entry[] = [];
    const rank = (s: ChipStatus) =>
      s === 'unsuitable' ? 0 : s === 'no-result' ? 1 : s === 'outdated' ? 2 : 3;
    for (const b of beaches) {
      const entries = [
        b.single,
        b.cluster && !b.cluster.el.hidden ? b.cluster : undefined,
        ...b.pins.filter((p) => !p.el.hidden),
      ].filter((e): e is Entry => !!e);
      for (const e of entries) {
        e.labelOk = false;
        all.push(e);
        const ll = e.marker.getLngLat();
        const { x, y } = map.project(ll);
        if (x < -margin || y < -margin || x > cw + margin || y > ch + margin)
          continue;
        obstacles.push({ x, y, tag: !!e.el.querySelector('.marker__tag') });
        if (e.autoLabel && zoom >= LABEL_FLOOR_ZOOM) {
          // Selecionado/foco/hover já têm nome garantido; reserva o espaço deles primeiro.
          const forced = e.selected || e.focused || e.hovered;
          candidates.push({
            id: String(all.length - 1),
            x,
            y,
            width: labelWidth(e),
            rank: (forced ? -10 : 0) + rank(e.status),
          });
        }
      }
    }
    for (const id of pickLabels(candidates, obstacles))
      all[Number(id)].labelOk = true;
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
          true,
          m.id,
          () => {
            // Abre a ficha (o sidebar passa a cobrir a direita) e aproxima o ponto (nunca afasta)
            // até o centro da área visível, em movimento suave.
            onSelect({ slug: g.slug, pointId: m.id });
            map.easeTo({
              center: [m.lng, m.lat],
              zoom: Math.max(map.getZoom(), POINT_FOCUS_ZOOM),
              offset: shift(),
              ...motion(),
            });
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
          true,
          undefined,
          () => {
            // Primeiro passo: só enquadra os pontos (sem aproximar demais) e abre o grupo
            // em pins numerados. A ficha NÃO abre; ela abre ao clicar num pin.
            expandedSlug = g.slug;
            map.fitBounds(boundsOf(g.points)!, {
              padding: pad(),
              maxZoom: GROUP_FIT_MAX_ZOOM,
              ...motion(),
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
            false,
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
  map.on('moveend', update);
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
  map.once('idle', () => {
    ready = true;
    onState('ready');
  });

  return {
    // Zoom dos botões: suave, com o tempo e a curva da câmera (e do painel).
    zoomIn: () => map.zoomIn({ ...motion() }),
    zoomOut: () => map.zoomOut({ ...motion() }),
    fit() {
      if (bounds) map.fitBounds(bounds, { padding: pad(), ...motion() });
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
          offset: shift(),
          ...motion(),
        });
        return;
      }
      expandedSlug = slug;
      map.fitBounds(boundsOf(entry.points)!, {
        padding: pad(),
        maxZoom: GROUP_FIT_MAX_ZOOM,
        ...motion(),
      });
      update();
    },
    fitBeaches(slugs) {
      const points = beaches
        .filter((b) => slugs.includes(b.slug))
        .flatMap((b) => b.points);
      const bounds = boundsOf(points);
      if (!bounds) return; // nenhuma praia do grupo está no mapa: não mexe na câmera
      map.fitBounds(bounds, {
        padding: pad(),
        maxZoom: GROUP_FIT_MAX_ZOOM,
        ...motion(),
      });
      update();
    },
    select(slug, pointId = null) {
      selectedSlug = slug;
      selectedPointId = pointId;
      update();
    },
    revealSelected() {
      const entry = beaches.find((b) => b.slug === selectedSlug);
      if (!entry) return;
      const m =
        entry.points.find((p) => p.id === selectedPointId) ?? entry.points[0];
      if (!m) return;
      // Já há um movimento de câmera em curso (clique no pin, escolha na busca, enquadramento):
      // ele já conta com o painel; este não o interrompe.
      if (map.isMoving()) return;
      const c = covered();
      if (c.right <= 0 && c.bottom <= 0) return;
      const { x, y } = map.project([m.lng, m.lat]);
      const edge = VIEW_PADDING / 2;
      if (
        x >= edge &&
        x <= container.clientWidth - c.right - edge &&
        y >= edge &&
        y <= container.clientHeight - c.bottom - edge
      )
        return; // já aparece
      map.easeTo({
        center: [m.lng, m.lat],
        offset: shift(),
        ...motion(),
      });
    },
    getMap: () => map,
    destroy: () => {
      resizeObserver.disconnect();
      map.remove();
    },
  };
}
