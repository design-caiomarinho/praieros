import { describe, expect, it } from 'vitest';
import { pointsLabel } from './points-label.ts';

describe('pointsLabel', () => {
  it('usa singular para 0 e 1 ponto (concept da busca)', () => {
    expect(pointsLabel(0)).toBe('0 ponto de coleta');
    expect(pointsLabel(1)).toBe('1 ponto de coleta');
  });
  it('usa plural para 2 ou mais', () => {
    expect(pointsLabel(3)).toBe('3 pontos de coleta');
  });
});
