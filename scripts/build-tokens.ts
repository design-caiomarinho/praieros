import { readFileSync, writeFileSync } from 'node:fs';
import { tokensToCss } from '../src/lib/tokens/to-css.ts';

const tree = JSON.parse(readFileSync('tokens/tokens.json', 'utf8'));
writeFileSync('src/styles/tokens.css', tokensToCss(tree));
console.log('src/styles/tokens.css gerado.');
