// Converte tokens/tokens.json (formato DTCG exportado do Figma) em CSS variables.
// Função pura: sem I/O. Aliases viram var(--...); literais ganham unidade conforme o grupo.

type TokenNode = { $type: string; $value: string | number };
type TokenTree = { [key: string]: TokenNode | TokenTree };

export type FlatToken = {
  path: string[];
  type: string;
  value: string | number;
};

const FONT_FALLBACK = 'system-ui, sans-serif';

function isToken(node: TokenNode | TokenTree): node is TokenNode {
  return '$value' in node;
}

export function flatten(tree: TokenTree, path: string[] = []): FlatToken[] {
  const out: FlatToken[] = [];
  for (const [key, node] of Object.entries(tree)) {
    if (isToken(node)) {
      out.push({ path: [...path, key], type: node.$type, value: node.$value });
    } else {
      out.push(...flatten(node, [...path, key]));
    }
  }
  return out;
}

export const varName = (path: string[]): string => `--${path.join('-')}`;

function literal(token: FlatToken): string {
  const [group, kind, sub] = token.path;
  const { value } = token;
  if (token.type === 'color') return String(value);
  if (group === 'primitives' && kind === 'spacing') return `${value}px`;
  if (group === 'primitives' && kind === 'font') {
    if (sub === 'size') return `${value}px`;
    if (sub === 'line-height') return String(value);
    // Figma dá -1 sem unidade; tratado como % (ver docs/decisions.md): -1 -> -0.01em.
    if (sub === 'letter-spacing') return `${Number(value) / 100}em`;
    // O valor é o nome do peso; o número está na chave (400, 500, 600).
    if (sub === 'weight') return token.path[3];
    if (sub === 'family') return `"${String(value).trim()}", ${FONT_FALLBACK}`;
  }
  throw new Error(
    `Valor literal sem regra de conversão: ${token.path.join('.')}`,
  );
}

export function tokensToCss(tree: TokenTree): string {
  const tokens = flatten(tree);
  const known = new Set(tokens.map((t) => t.path.join('.')));
  const lines: string[] = [];
  let lastGroup = '';
  for (const token of tokens) {
    const group = token.path[0];
    if (lastGroup && group !== lastGroup) lines.push('');
    lastGroup = group;
    let css: string;
    const alias =
      typeof token.value === 'string' && token.value.match(/^\{(.+)\}$/);
    if (alias) {
      if (!known.has(alias[1])) {
        throw new Error(
          `Alias sem destino: ${token.path.join('.')} -> ${alias[1]}`,
        );
      }
      css = `var(${varName(alias[1].split('.'))})`;
    } else {
      css = literal(token);
    }
    lines.push(`  ${varName(token.path)}: ${css};`);
  }
  return [
    '/* Gerado por `npm run tokens:build` a partir de tokens/tokens.json. Não editar. */',
    ':root {',
    ...lines,
    '}',
    '',
  ].join('\n');
}
