import { describe, expect, it } from 'vitest';
import { cssTimeMs } from './css-time.ts';

describe('cssTimeMs', () => {
  it('lê milissegundos', () => {
    expect(cssTimeMs('300ms')).toBe(300);
    expect(cssTimeMs(' 1500ms ')).toBe(1500);
  });
  it('lê segundos como o CSS minificado grava (.3s, 1.5s, 1s)', () => {
    expect(cssTimeMs('.3s')).toBeCloseTo(300);
    expect(cssTimeMs('1.5s')).toBeCloseTo(1500);
    expect(cssTimeMs('1s')).toBe(1000);
  });
  it('número puro é milissegundo; texto inválido vale 0', () => {
    expect(cssTimeMs('250')).toBe(250);
    expect(cssTimeMs('')).toBe(0);
    expect(cssTimeMs('calc(1s)')).toBe(0);
  });
});
