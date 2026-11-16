import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flatten, mergeTrees, tokensToCss } from './to-css.ts';
import { tokensToDocs } from './to-docs.ts';
import { readUsage } from '../../../scripts/token-usage.ts';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('tokens: JSON e CSS em sincronia', () => {
  const base = read('tokens/tokens.json');
  const code = read('tokens/code.json');

  it('src/styles/tokens.css é o que `npm run tokens:build` gera', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    expect(css).toBe(tokensToCss(mergeTrees(base, code)));
  });

  it('docs/tokens.md é o que `npm run tokens:docs` gera', () => {
    const md = readFileSync('docs/tokens.md', 'utf8');
    const gerado = tokensToDocs(mergeTrees(base, code), readUsage());
    // O arquivo passa pelo Prettier; compara sem espaços de alinhamento das tabelas.
    const norm = (t: string) => t.replace(/ +/g, ' ').replace(/-{3,}/g, '---');
    expect(norm(md)).toBe(norm(gerado));
  });

  it('code.json não repete nada do tokens.json (que espelha o Figma)', () => {
    expect(() => mergeTrees(base, code)).not.toThrow();
  });

  it('nenhum grupo usa o prefixo antigo "s-"', () => {
    const groups = new Set(
      flatten(mergeTrees(base, code)).map((t) => t.path[0]),
    );
    expect([...groups].filter((g) => g.startsWith('s-'))).toEqual([]);
  });

  it('tokens.json só tem os grupos que existem (ou vão existir) no Figma', () => {
    expect(Object.keys(base).sort()).toEqual([
      'border-width',
      'color',
      'primitives',
      'radius',
      'size',
      'space',
      'typo',
    ]);
  });
});
