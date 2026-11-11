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

/**
 * Área de navegação: o limite do OpenStreetMap com o oeste cortado em -38.56 e o norte em -12.83. O limite
 * administrativo inclui as ilhas da Baía (Frades, Bom Jesus) e deixa o mapa deslocado para
 * o mar da Baía e o Recôncavo, que não representam a cidade. Cobre a orla atlântica e a
 * Cidade Baixa (Ribeira, Paripe, Ilha de Maré), e deixa o mapa centrado nas praias, sem subir além do litoral norte.
 */
export const SALVADOR_URBAN_BOUNDS: Bounds = [
  [-38.56, SALVADOR_OSM_BOUNDS[0][1]],
  [SALVADOR_OSM_BOUNDS[1][0], -12.83],
];

/** Folga em graus (cerca de 2 km) para praias na borda não ficarem cortadas. */
export const SALVADOR_BOUNDS_MARGIN = 0.02;

/** Área de navegação do mapa; `points` amplia o retângulo se algum ponto ficar de fora. */
export function navigationBounds(points: readonly LngLat[] = []): Bounds {
  return extendBounds(
    padBounds(SALVADOR_URBAN_BOUNDS, SALVADOR_BOUNDS_MARGIN),
    points,
  );
}
