/**
 * Ingestão agendada: busca a página do Inema, baixa os PDFs, lê, valida e grava
 * em data/bulletins/. Cada região é independente (D4 por região). Se algo falhar,
 * grava o que for válido e sai com código 1 (o workflow commita o válido e falha).
 *
 *   npm run bulletins:ingest
 */
import { fileURLToPath } from 'node:url';
import { fetchBulletinPdfs } from '../src/lib/inema/fetch-bulletins.ts';
import { hasFailure, runIngest } from '../src/lib/inema/ingest-run.ts';

const OUT_DIR = fileURLToPath(new URL('../data/bulletins/', import.meta.url));

const outcome = await runIngest(await fetchBulletinPdfs(), OUT_DIR);

if (outcome.fatal) console.error(`::error::${outcome.fatal}`);
for (const r of outcome.regions) {
  if (r.status === 'error') {
    for (const e of r.errors) console.error(`::error::${r.region}: ${e}`);
  } else {
    console.log(`${r.status.toUpperCase()}  ${r.region}: ${r.file}`);
  }
}
process.exit(hasFailure(outcome) ? 1 : 0);
