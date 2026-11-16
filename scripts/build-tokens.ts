import { readFileSync, writeFileSync } from 'node:fs';
import { mergeTrees, tokensToCss } from '../src/lib/tokens/to-css.ts';

const base = JSON.parse(readFileSync('tokens/tokens.json', 'utf8'));
// code.json: tokens só do código (movimento, tamanhos de layout) (ver docs/decisions.md).
const code = JSON.parse(readFileSync('tokens/code.json', 'utf8'));
const tree = mergeTrees(base, code);
writeFileSync('src/styles/tokens.css', tokensToCss(tree));
console.log('src/styles/tokens.css gerado.');
