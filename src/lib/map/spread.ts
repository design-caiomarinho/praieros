import { mercatorY, type LngLat } from './bounds.ts';

/** Afastamento mínimo, em pixels de tela, para o grupo da praia se abrir sozinho. */
export const GROUP_OPEN_MIN_SPREAD_PX = 56;
/** Zoom máximo ao enquadrar os pontos de uma praia no clique (não aproximar demais). */
export const GROUP_FIT_MAX_ZOOM = 17;

const TILE_SIZE = 512; // tamanho de tile do MapLibre

function toPixels(p: LngLat, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  return { x: ((p.lng + 180) / 360) * scale, y: mercatorY(p.lat) * scale };
}

/** Maior distância, em pixels de tela, entre dois pontos quaisquer da lista. */
export function maxSpreadPx(points: readonly LngLat[], zoom: number): number {
  const px = points.map((p) => toPixels(p, zoom));
  let max = 0;
  for (let i = 0; i < px.length; i++)
    for (let j = i + 1; j < px.length; j++)
      max = Math.max(max, Math.hypot(px[i].x - px[j].x, px[i].y - px[j].y));
  return max;
}

/** Com este zoom, os pontos ficam afastados o bastante para aparecerem cada um no seu lugar? */
export function isGroupSpread(
  points: readonly LngLat[],
  zoom: number,
  minPx: number = GROUP_OPEN_MIN_SPREAD_PX,
): boolean {
  return points.length > 1 && maxSpreadPx(points, zoom) >= minPx;
}

/** Centro do retângulo que contém os pontos (posição do marcador agrupado). */
export function centerOf(points: readonly LngLat[]): LngLat {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}
