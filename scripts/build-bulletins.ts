/**
 * Lê os PDFs salvos em fixtures/ e grava os boletins válidos em data/bulletins/.
 * Não acessa a rede. Se a validação falhar, não grava nada daquela região (D4).
 *
 *   npm run bulletins:build
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { regionIdFromLabel } from '../src/lib/inema/bulletin.ts';
import {
  REGION_LABELS,
  findRegionLinks,
} from '../src/lib/inema/fetch-bulletins.ts';
import { ingestPdf } from '../src/lib/inema/ingest-bulletin.ts';

const FIXTURES = new URL('../fixtures/', import.meta.url);
const OUT_DIR = fileURLToPath(new URL('../data/bulletins/', import.meta.url));
const FILES = {
  SALVADOR: 'salvador.pdf',
  'BAÍA DE TODOS-OS-SANTOS': 'baia-de-todos-os-santos.pdf',
} as const;

const html = await readFile(
  new URL('qualidade-das-praias.html', FIXTURES),
  'utf8',
);
const links = findRegionLinks(html);
let failed = false;

for (const label of REGION_LABELS) {
  const link = links[label];
  const bytes = new Uint8Array(await readFile(new URL(FILES[label], FIXTURES)));
  const result = await ingestPdf(bytes, {
    region: regionIdFromLabel(label),
    sourceUrl: link.ok ? link.url : null,
    dir: OUT_DIR,
  });
  if (result.ok) {
    console.log(`${result.status.toUpperCase()}  ${label}: ${result.file}`);
    if (result.status === 'conflict') failed = true;
  } else {
    failed = true;
    console.error(`FALHA  ${label}: nada foi gravado.`);
    for (const e of result.errors) console.error(`  - ${e}`);
  }
}
process.exit(failed ? 1 : 0);
