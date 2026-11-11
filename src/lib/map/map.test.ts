import { describe, expect, it } from 'vitest';
import { boundsOf } from './bounds.ts';
import { applyPalette } from './palette.ts';

describe('boundsOf', () => {
  it('lista vazia: null', () => {
    expect(boundsOf([])).toBeNull();
  });
  it('enquadra todos os pontos', () => {
    expect(
      boundsOf([
        { lat: -13, lng: -38.5 },
        { lat: -12.9, lng: -38.4 },
      ]),
    ).toEqual([
      [-38.5, -13],
      [-38.4, -12.9],
    ]);
  });
});

describe('applyPalette', () => {
  type L = {
    id: string;
    type: string;
    paint: Record<string, unknown>;
    layout?: Record<string, unknown>;
  };
  const layer = (
    id: string,
    type: string,
    paint: Record<string, unknown> = {},
  ) => ({ id, type, paint });
  const style = {
    glyphs: 'g',
    sprite: 's',
    layers: [
      layer('background', 'background', { 'background-color': 'x' }),
      layer('water', 'fill', { 'fill-color': 'x', 'fill-opacity': 0.5 }),
      layer('park', 'fill'),
      layer('landcover-sand', 'fill'),
      layer('building', 'fill'),
      layer('landuse-school', 'fill'),
      layer('highway-minor', 'line'),
      layer('highway-minor-casing', 'line'),
      layer('boundary_2', 'line'),
      layer('place_label', 'symbol'),
      layer('poi', 'symbol'),
      layer('unknown-layer', 'line', { 'line-color': 'x' }),
    ],
  };
  const palette = {
    land: 'L',
    water: 'W',
    park: 'P',
    sand: 'S',
    block: 'B',
    road: 'R',
  };
  const out = applyPalette(style, palette);
  const byId = (id: string) => out.layers.find((l) => l.id === id)! as L;

  it('remove todo texto e ícone: camadas symbol, glyphs e sprite', () => {
    expect(out.layers.some((l) => l.type === 'symbol')).toBe(false);
    expect(out).not.toHaveProperty('glyphs');
    expect(out).not.toHaveProperty('sprite');
  });
  it('pinta terreno, mar, parques, areia, quadras e ruas com a paleta', () => {
    expect(byId('background').paint).toEqual({ 'background-color': 'L' });
    expect(byId('water').paint).toEqual({ 'fill-color': 'W' });
    expect(byId('park').paint).toEqual({ 'fill-color': 'P' });
    expect(byId('landcover-sand').paint).toEqual({ 'fill-color': 'S' });
    expect(byId('building').paint).toEqual({ 'fill-color': 'B' });
    expect(byId('landuse-school').paint).toEqual({ 'fill-color': 'L' });
    expect(byId('highway-minor').paint).toEqual({ 'line-color': 'R' });
    expect(byId('highway-minor-casing').paint).toEqual({ 'line-color': 'R' });
  });
  it('esconde fronteiras e não toca em camadas desconhecidas nem no original', () => {
    expect(byId('boundary_2').layout).toEqual({ visibility: 'none' });
    expect(byId('unknown-layer')).toBe(style.layers[11]);
    expect(style.layers[1].paint['fill-color']).toBe('x');
    expect(style.layers).toHaveLength(12);
  });
});

import { readFileSync } from 'node:fs';
import {
  containsPoint,
  extendBounds,
  minZoomToFit,
  padBounds,
  type Bounds,
} from './bounds.ts';
import { navigationBounds, SALVADOR_OSM_BOUNDS } from './salvador-bounds.ts';

describe('padBounds e extendBounds', () => {
  const b: Bounds = [
    [-38.5, -13],
    [-38.3, -12.8],
  ];
  it('padBounds acrescenta a folga nos quatro lados', () => {
    const p = padBounds(b, 0.1).flat();
    [-38.6, -13.1, -38.2, -12.7].forEach((v, i) =>
      expect(p[i]).toBeCloseTo(v, 9),
    );
  });
  it('extendBounds inclui pontos de fora e mantém o resto', () => {
    expect(extendBounds(b, [{ lat: -13.2, lng: -38.1 }])).toEqual([
      [-38.5, -13.2],
      [-38.1, -12.8],
    ]);
    expect(extendBounds(b, [{ lat: -12.9, lng: -38.4 }])).toEqual(b);
  });
});

describe('minZoomToFit', () => {
  it('retângulo que cobre o mundo inteiro cabe em zoom 0 numa tela de 512px', () => {
    const world: Bounds = [
      [-180, -85],
      [180, 85],
    ];
    expect(minZoomToFit(world, { width: 512, height: 512 })).toBeCloseTo(0, 0);
  });
  it('dobrar a largura da tela soma 1 ao zoom', () => {
    const b = SALVADOR_OSM_BOUNDS;
    const a = minZoomToFit(b, { width: 800, height: 5000 });
    const c = minZoomToFit(b, { width: 1600, height: 5000 });
    expect(c - a).toBeCloseTo(1, 5);
  });
  it('usa o lado que mais limita (tela estreita e alta usa a largura)', () => {
    const b = SALVADOR_OSM_BOUNDS;
    const narrow = minZoomToFit(b, { width: 400, height: 2000 });
    const square = minZoomToFit(b, { width: 400, height: 400 });
    expect(narrow).toBeGreaterThanOrEqual(square);
  });
  it('tela sem tamanho: zoom 0; nunca negativo', () => {
    expect(minZoomToFit(SALVADOR_OSM_BOUNDS, { width: 0, height: 0 })).toBe(0);
    expect(
      minZoomToFit(
        [
          [-180, -85],
          [180, 85],
        ],
        { width: 10, height: 10 },
      ),
    ).toBe(0);
  });
});

describe('navigationBounds', () => {
  it('tem folga em relação ao limite do OpenStreetMap', () => {
    const b = navigationBounds();
    expect(b[0][0]).toBeLessThan(SALVADOR_OSM_BOUNDS[0][0]);
    expect(b[1][1]).toBeGreaterThan(SALVADOR_OSM_BOUNDS[1][1]);
  });
  it('inclui todos os pontos do catálogo (se um ficar fora, o retângulo cresce)', () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL('../../../data/catalog/salvador.json', import.meta.url),
        'utf8',
      ),
    ) as {
      beaches: { points: { lat: number | null; lng: number | null }[] }[];
    };
    const pts = catalog.beaches
      .flatMap((b) => b.points)
      .filter((p) => p.lat !== null && p.lng !== null)
      .map((p) => ({ lat: p.lat as number, lng: p.lng as number }));
    const b = navigationBounds(pts);
    expect(pts.every((p) => containsPoint(b, p))).toBe(true);
    // Hoje nenhum ponto está fora do limite com folga: a constante não precisou crescer.
    expect(b).toEqual(navigationBounds());
  });
});
