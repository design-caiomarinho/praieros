import { extendBounds, padBounds, type Bounds, type LngLat } from './bounds.ts';

/**
 * Limite administrativo de Salvador (OpenStreetMap, relação 362362, consultado uma vez no
 * Overpass por `scripts/fetch-salvador-bounds.ts`): oeste -38.6994346, sul -13.0173949,
 * leste -38.3034141, norte -12.7335624. Inclui as ilhas da Baía de Todos-os-Santos.
 */
export const SALVADOR_OSM_BOUNDS: Bounds = [
  [-38.6994346, -13.0173949],
  [-38.3034141, -12.7335624],
];

/** Folga em graus (cerca de 2 km) para praias na borda não ficarem cortadas. */
export const SALVADOR_BOUNDS_MARGIN = 0.02;

/** Área de navegação do mapa; `points` amplia o retângulo se algum ponto ficar de fora. */
export function navigationBounds(points: readonly LngLat[] = []): Bounds {
  return extendBounds(
    padBounds(SALVADOR_OSM_BOUNDS, SALVADOR_BOUNDS_MARGIN),
    points,
  );
}
