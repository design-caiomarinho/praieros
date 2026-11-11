import { readFileSync, writeFileSync } from 'node:fs';
import { mergeTrees, tokensToCss } from '../src/lib/tokens/to-css.ts';

const base = JSON.parse(readFileSync('tokens/tokens.json', 'utf8'));
// extra.json: valores assumidos que o export do Figma não tem (ver docs/decisions.md).
const extra = JSON.parse(readFileSync('tokens/extra.json', 'utf8'));
const tree = mergeTrees(base, extra);
writeFileSync('src/styles/tokens.css', tokensToCss(tree));
console.log('src/styles/tokens.css gerado.');
