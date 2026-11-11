import { describe, expect, it } from 'vitest';

// Smoke test da Fase 0: só prova que o runner funciona. Remover na Fase 1.
describe('setup', () => {
  it('executa testes', () => {
    expect(1 + 1).toBe(2);
  });
});
