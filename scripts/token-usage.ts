// Conta quantas vezes cada variável de token aparece em src/ (fora de tokens.css).
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Usage } from '../src/lib/tokens/to-docs.ts';

const EXTS = new Set(['.astro', '.ts', '.css']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) walk(f, acc);
    else if (EXTS.has(extname(e.name)) && e.name !== 'tokens.css') acc.push(f);
  }
  return acc;
}

export function readUsage(root = 'src'): Usage {
  const usage: Usage = {};
  for (const f of walk(root)) {
    if (f.endsWith('.test.ts')) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/--[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      usage[m[0]] = (usage[m[0]] ?? 0) + 1;
    }
  }
  return usage;
}
