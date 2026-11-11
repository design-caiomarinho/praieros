/** Cores do mapa, lidas dos tokens em tempo de execução (nada solto aqui). */
export interface MapPalette {
  land: string;
  water: string;
  park: string;
}

/** Camadas do estilo Positron (OpenFreeMap) e a cor de preenchimento que cada uma recebe. */
const FILL_BY_LAYER: Record<string, keyof MapPalette> = {
  background: 'land',
  landuse_residential: 'land',
  building: 'land',
  park: 'park',
  landcover_wood: 'park',
  water: 'water',
};

interface StyleLike {
  layers: { id: string; type: string; paint?: Record<string, unknown> }[];
}

/** Devolve uma cópia do estilo com mar, parques e terreno nas cores da paleta. */
export function applyPalette<T extends StyleLike>(
  style: T,
  palette: MapPalette,
): T {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const key = FILL_BY_LAYER[layer.id];
      if (!key) return layer;
      const prop =
        layer.type === 'background' ? 'background-color' : 'fill-color';
      return { ...layer, paint: { ...layer.paint, [prop]: palette[key] } };
    }),
  };
}
