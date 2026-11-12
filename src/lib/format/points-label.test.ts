import { describe, expect, it } from 'vitest';
import { pointsLabel } from './points-label.ts';

describe('pointsLabel', () => {
  it('diz "Sem ponto de coleta" quando não há ponto (pedido de Caio)', () => {
    expect(pointsLabel(0)).toBe('Sem ponto de coleta');
  });
  it('usa singular para 1 ponto', () => {
    expect(pointsLabel(1)).toBe('1 ponto de coleta');
  });
  it('usa plural para 2 ou mais', () => {
    expect(pointsLabel(3)).toBe('3 pontos de coleta');
  });
});
