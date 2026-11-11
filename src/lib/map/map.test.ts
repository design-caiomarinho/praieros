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
  const style = {
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': 'x' } as Record<string, unknown>,
      },
      {
        id: 'water',
        type: 'fill',
        paint: { 'fill-color': 'x', 'fill-opacity': 1 } as Record<
          string,
          unknown
        >,
      },
      {
        id: 'park',
        type: 'fill',
        paint: { 'fill-color': 'x' } as Record<string, unknown>,
      },
      {
        id: 'road',
        type: 'line',
        paint: { 'line-color': 'x' } as Record<string, unknown>,
      },
    ],
  };
  const palette = { land: 'L', water: 'W', park: 'P' };

  it('aplica terreno, mar e parques sem tocar nas outras camadas nem mutar o original', () => {
    const out = applyPalette(style, palette);
    expect(out.layers[0].paint).toEqual({ 'background-color': 'L' });
    expect(out.layers[1].paint).toEqual({
      'fill-color': 'W',
      'fill-opacity': 1,
    });
    expect(out.layers[2].paint).toEqual({ 'fill-color': 'P' });
    expect(out.layers[3]).toBe(style.layers[3]);
    expect(style.layers[1].paint['fill-color']).toBe('x');
  });
});
