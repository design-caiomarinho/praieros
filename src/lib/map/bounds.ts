export interface LngLat {
  lat: number;
  lng: number;
}

/** Centro e zoom usados quando não há nenhum ponto para enquadrar (ex.: produção sem pontos verificados). */
export const SALVADOR_FALLBACK = { lng: -38.4813, lat: -12.9714, zoom: 11 };

/** [[oeste, sul], [leste, norte]] dos pontos, ou null se a lista estiver vazia. */
export function boundsOf(
  points: readonly LngLat[],
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [
    [w, s],
    [e, n],
  ];
}

export type Bounds = [[number, number], [number, number]];

/** Amplia o retângulo em `margin` graus em cada lado. */
export function padBounds(b: Bounds, margin: number): Bounds {
  return [
    [b[0][0] - margin, b[0][1] - margin],
    [b[1][0] + margin, b[1][1] + margin],
  ];
}

/** Amplia o retângulo, se preciso, para incluir todos os pontos. */
export function extendBounds(b: Bounds, points: readonly LngLat[]): Bounds {
  let [[w, s], [e, n]] = b;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [
    [w, s],
    [e, n],
  ];
}

export function containsPoint(b: Bounds, p: LngLat): boolean {
  return (
    p.lng >= b[0][0] && p.lng <= b[1][0] && p.lat >= b[0][1] && p.lat <= b[1][1]
  );
}

const TILE_SIZE = 512; // tamanho de tile do MapLibre

/** Posição vertical (0 a 1, de cima para baixo) de uma latitude na projeção Web Mercator. */
function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI);
}

/**
 * Zoom em que o retângulo cabe inteiro numa área de `width` x `height` pixels.
 * É o zoom mínimo permitido: afastar além disso mostraria mais do que Salvador.
 * Nunca negativo.
 */
export function minZoomToFit(
  b: Bounds,
  size: { width: number; height: number },
): number {
  if (size.width <= 0 || size.height <= 0) return 0;
  const fracX = (b[1][0] - b[0][0]) / 360;
  const fracY = Math.abs(mercatorY(b[0][1]) - mercatorY(b[1][1]));
  const zoom = Math.log2(
    Math.min(
      size.width / (TILE_SIZE * fracX),
      size.height / (TILE_SIZE * fracY),
    ),
  );
  return Math.max(0, zoom);
}
