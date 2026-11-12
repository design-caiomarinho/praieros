import { describe, expect, it } from 'vitest';
import { cubicBezier, halfwayTime, parseCubicBezier } from './cubic-bezier.ts';

describe('cubicBezier', () => {
  it('fixa as pontas em 0 e 1', () => {
    const f = cubicBezier(0.645, 0.045, 0.355, 1);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
  });
  it('curva (0,0,1,1) é linear', () => {
    const f = cubicBezier(0, 0, 1, 1);
    expect(f(0.3)).toBeCloseTo(0.3, 4);
  });
  it('ease-in-out é simétrica no meio', () => {
    expect(cubicBezier(0.645, 0.045, 0.355, 1)(0.5)).toBeCloseTo(0.5, 1);
  });
  it('lê o valor de um token CSS', () => {
    const f = parseCubicBezier('cubic-bezier(0.645, 0.045, 0.355, 1)');
    expect(f(0.5)).toBeCloseTo(cubicBezier(0.645, 0.045, 0.355, 1)(0.5), 6);
    expect(parseCubicBezier('lixo')(0.4)).toBe(0.4);
  });

  it('acha o instante dos 50% (curva simétrica = metade do tempo; a do painel chega antes)', () => {
    expect(halfwayTime('cubic-bezier(0.42, 0, 0.58, 1)')).toBeCloseTo(0.5, 2);
    const t = halfwayTime('cubic-bezier(0.175, 0.885, 0.32, 1.1)');
    expect(t).toBeLessThan(0.3);
    expect(cubicBezier(0.175, 0.885, 0.32, 1.1)(t)).toBeCloseTo(0.5, 2);
  });
});
