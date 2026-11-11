/** Cores do mapa, lidas dos tokens em tempo de execução (nada solto aqui). */
export interface MapPalette {
  /** Terreno. */
  land: string;
  /** Mar, rios e lagoas. */
  water: string;
  /** Parques, matas e gramados. */
  park: string;
  /** Areia. */
  sand: string;
  /** Quadras e construções. */
  block: string;
  /** Ruas. */
  road: string;
}

type Layer = {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};
interface StyleLike {
  layers: Layer[];
  glyphs?: string;
  sprite?: string;
}

/** Categoria de cor de uma camada do estilo Bright (OpenFreeMap); null = não mexer. */
function categorize(id: string): keyof MapPalette | 'hidden' | null {
  if (id === 'background') return 'land';
  if (id.startsWith('boundary') || id === 'ferry' || id.startsWith('cablecar'))
    return 'hidden';
  if (id.startsWith('waterway') || id.startsWith('water')) return 'water';
  if (id === 'landcover-sand') return 'sand';
  if (
    id === 'park' ||
    id === 'landcover-wood' ||
    id.startsWith('landcover-grass')
  )
    return 'park';
  if (id.startsWith('building')) return 'block';
  if (id.startsWith('landuse') || id.startsWith('landcover')) return 'land';
  if (id.startsWith('railway') || id.endsWith('railway')) return 'block';
  if (
    /^(highway|tunnel|bridge|aeroway|road_)/.test(id) ||
    id.startsWith('tunnel') ||
    id.startsWith('bridge')
  )
    return 'road';
  return null;
}

const COLOR_PROP: Record<string, string> = {
  background: 'background-color',
  fill: 'fill-color',
  line: 'line-color',
};

/**
 * Devolve uma cópia do estilo só com a geografia nas cores da paleta e SEM texto nem ícones:
 * as camadas `symbol` (nomes de ruas, bairros, lugares) saem, e com elas `glyphs` e `sprite`.
 * Só os rótulos dos marcadores do site aparecem sobre o mapa.
 */
export function applyPalette<T extends StyleLike>(
  style: T,
  palette: MapPalette,
): T {
  const { glyphs: _glyphs, sprite: _sprite, ...rest } = style;
  void _glyphs;
  void _sprite;
  const layers = style.layers
    .filter((layer) => layer.type !== 'symbol')
    .map((layer): Layer => {
      const category = categorize(layer.id);
      if (!category) return layer;
      if (category === 'hidden') {
        return { ...layer, layout: { ...layer.layout, visibility: 'none' } };
      }
      const prop = COLOR_PROP[layer.type];
      if (!prop) return layer;
      // Sem opacidade e sem padrão: a cor do token aparece como está.
      const {
        'fill-pattern': _p,
        'fill-opacity': _o,
        ...paint
      } = layer.paint ?? {};
      void _p;
      void _o;
      return { ...layer, paint: { ...paint, [prop]: palette[category] } };
    });
  return { ...(rest as T), layers };
}
