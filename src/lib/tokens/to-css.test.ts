import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokensToCss } from './to-css.ts';

describe('tokensToCss', () => {
  it('resolve aliases como var() e dá unidade aos literais', () => {
    const css = tokensToCss({
      primitives: {
        spacing: { '8': { $type: 'number', $value: 8 } },
        font: {
          family: { body: { $type: 'text', $value: ' Switzer' } },
          weight: { '600': { $type: 'text', $value: 'semibold' } },
          'letter-spacing': { tight: { $type: 'number', $value: -1 } },
          'line-height': { '150': { $type: 'number', $value: 1.5 } },
        },
      },
      space: {
        gap: { xs: { $type: 'number', $value: '{primitives.spacing.8}' } },
      },
    });
    expect(css).toContain('--primitives-spacing-8: 8px;');
    expect(css).toContain('--space-gap-xs: var(--primitives-spacing-8);');
    expect(css).toContain(
      '--primitives-font-family-body: "Switzer", system-ui, sans-serif;',
    );
    expect(css).toContain('--primitives-font-weight-600: 600;');
    expect(css).toContain('--primitives-font-letter-spacing-tight: -0.01em;');
    expect(css).toContain('--primitives-font-line-height-150: 1.5;');
  });

  it('falha em alias sem destino', () => {
    expect(() =>
      tokensToCss({ a: { b: { $type: 'color', $value: '{x.y}' } } }),
    ).toThrow('Alias sem destino');
  });

  it('converte tokens/tokens.json sem erro e sem alias solto', () => {
    const css = tokensToCss(
      JSON.parse(readFileSync('tokens/tokens.json', 'utf8')),
    );
    expect(css).not.toMatch(/[{]primitives|[{]s-/);
    expect(css).toContain(
      '--s-color-surface-negative-default: var(--primitives-color-red-400);',
    );
  });
});
