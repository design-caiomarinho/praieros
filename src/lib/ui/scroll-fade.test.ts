import { describe, expect, it } from 'vitest';
import { hasMoreBelow } from './scroll-fade.ts';

describe('hasMoreBelow', () => {
  it('há mais conteúdo quando ainda dá para rolar', () => {
    expect(hasMoreBelow(0, 400, 900)).toBe(true);
    expect(hasMoreBelow(300, 400, 900)).toBe(true);
  });
  it('não há quando chegou ao fim (com tolerância de subpixel)', () => {
    expect(hasMoreBelow(500, 400, 900)).toBe(false);
    expect(hasMoreBelow(499.5, 400, 900)).toBe(false);
  });
  it('não há quando o conteúdo cabe', () => {
    expect(hasMoreBelow(0, 400, 400)).toBe(false);
  });
});
