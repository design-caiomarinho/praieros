import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveColor } from './colors.ts';

describe('resolveColor', () => {
  it('segue os aliases até o valor final', () => {
    const tree = {
      primitives: { color: { neutral: { '50': { $value: '#fcfdfd' } } } },
      color: {
        surface: { default: { $value: '{primitives.color.neutral.50}' } },
      },
    };
    expect(resolveColor(tree, 'color.surface.default')).toBe('#fcfdfd');
  });

  it('lê o fundo padrão dos tokens reais', () => {
    const tokens = JSON.parse(readFileSync('tokens/tokens.json', 'utf8'));
    expect(resolveColor(tokens, 'color.surface.default')).toMatch(
      /^#[0-9a-f]{6}$/i,
    );
  });

  it('falha com token inexistente', () => {
    expect(() => resolveColor({}, 'color.nada')).toThrow(/não encontrado/);
  });
});
