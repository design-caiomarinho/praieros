import { describe, expect, it } from 'vitest';
import { LABEL_FLOOR_ZOOM, pickLabels } from './label-visibility.ts';
import { isGroupOpen } from './spread.ts';

// ~100 m entre os pontos (lat -13)
const a = { lat: -13.0, lng: -38.5 };
const b = { lat: -13.0, lng: -38.499 };

describe('isGroupOpen', () => {
  it('um ponto só nunca abre', () => {
    expect(isGroupOpen([a], 18, true)).toBe(false);
  });
  it('sem pedido, só abre quando os pontos se afastam sozinhos', () => {
    expect(isGroupOpen([a, b], 10, false)).toBe(false);
    expect(isGroupOpen([a, b], 17, false)).toBe(true);
  });
  it('com pedido, fecha ao afastar o zoom até os pins se sobreporem', () => {
    expect(isGroupOpen([a, b], 17, true)).toBe(true);
    expect(isGroupOpen([a, b], 12, true)).toBe(false);
  });
  it('com pedido, no zoom de enquadramento abre mesmo com pontos muito próximos', () => {
    const near = { lat: -13.0, lng: -38.49999 };
    expect(isGroupOpen([a, near], 17, true)).toBe(true);
    expect(isGroupOpen([a, near], 13, true)).toBe(false);
  });
});

describe('pickLabels', () => {
  const w = 100;
  it('mostra o nome quando há espaço', () => {
    const r = pickLabels(
      [{ id: 'a', x: 100, y: 100, width: w, rank: 0 }],
      [{ x: 100, y: 100 }],
    );
    expect(r.has('a')).toBe(true);
  });
  it('o de menor rank ganha quando os nomes se sobrepõem', () => {
    const r = pickLabels(
      [
        { id: 'a', x: 100, y: 100, width: w, rank: 1 },
        { id: 'b', x: 140, y: 100, width: w, rank: 0 },
      ],
      [
        { x: 100, y: 100 },
        { x: 140, y: 100 },
      ],
    );
    expect([...r]).toEqual(['b']);
  });
  it('não cobre o ícone de outro marcador', () => {
    const r = pickLabels(
      [{ id: 'a', x: 100, y: 100, width: w, rank: 0 }],
      [
        { x: 100, y: 100 },
        { x: 100, y: 128 },
      ],
    );
    expect(r.size).toBe(0);
  });
  it('piso de zoom definido', () => {
    expect(LABEL_FLOOR_ZOOM).toBeGreaterThan(0);
  });
});
