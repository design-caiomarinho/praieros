import { readFileSync, writeFileSync } from 'node:fs';
import { mergeTrees } from '../src/lib/tokens/to-css.ts';
import { tokensToDocs } from '../src/lib/tokens/to-docs.ts';
import { readUsage } from './token-usage.ts';

const base = JSON.parse(readFileSync('tokens/tokens.json', 'utf8'));
const code = JSON.parse(readFileSync('tokens/code.json', 'utf8'));
writeFileSync(
  'docs/tokens.md',
  tokensToDocs(mergeTrees(base, code), readUsage()),
);
console.log('docs/tokens.md gerado.');
