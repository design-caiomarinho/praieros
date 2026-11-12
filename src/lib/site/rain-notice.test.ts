import { describe, expect, it } from 'vitest';
import { shouldShowRainNotice } from './rain-notice.ts';

describe('shouldShowRainNotice', () => {
  it('mostra quando o único ponto é Própria', () => {
    expect(shouldShowRainNotice(['suitable'])).toBe(true);
  });
  it('mostra em praia desatualizada cujo último status é Própria', () => {
    // a ficha desatualizada exibe o último status conhecido dos pontos
    expect(shouldShowRainNotice(['suitable', 'suitable'])).toBe(true);
  });
  it('mostra com pontos mistos (Própria e Imprópria)', () => {
    expect(shouldShowRainNotice(['unsuitable', 'suitable'])).toBe(true);
  });
  it('não mostra quando todos os pontos são Impróprios', () => {
    expect(shouldShowRainNotice(['unsuitable', 'unsuitable'])).toBe(false);
  });
  it('não mostra em praia desatualizada com último status Impróprio', () => {
    expect(shouldShowRainNotice(['unsuitable'])).toBe(false);
  });
  it('não mostra sem pontos (referência, sem resultado, antiga demais, nunca apareceu)', () => {
    expect(shouldShowRainNotice([])).toBe(false);
  });
  it('não mostra quando os pontos estão sem resultado', () => {
    expect(shouldShowRainNotice(['no-result'])).toBe(false);
  });
});
