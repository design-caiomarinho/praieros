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
