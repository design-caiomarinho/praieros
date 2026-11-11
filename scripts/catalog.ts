/**
 * Valida o catálogo contra o boletim atual de Salvador ou gera docs/catalog-todo.md.
 *
 *   npm run catalog:validate   (sai com erro se faltar código ou houver dado inválido)
 *   npm run catalog:todo
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildCatalogTodo } from '../src/lib/catalog/todo.ts';
import { validateCatalog } from '../src/lib/catalog/validate-catalog.ts';
import { currentBulletin } from '../src/lib/rules/evaluate.ts';
import { loadSalvadorInputs } from '../src/lib/site/load-data.ts';

const mode = process.argv[2];
const { bulletins, catalog } = await loadSalvadorInputs();
const points = currentBulletin(bulletins)?.points ?? [];

if (mode === 'todo') {
  const out = fileURLToPath(
    new URL('../docs/catalog-todo.md', import.meta.url),
  );
  await writeFile(out, buildCatalogTodo(catalog, points), 'utf8');
  console.log(`Gravado ${out}`);
} else {
  const r = validateCatalog(catalog, points);
  const list = (title: string, items: object[]) => {
    if (items.length === 0) return;
    console.log(`${title} (${items.length}):`);
    for (const i of items) console.log(`  ${JSON.stringify(i)}`);
  };
  list('FALTAM no catálogo (erro)', r.missing);
  list('INVÁLIDOS (erro)', r.invalid);
  list('SOBRAM no catálogo (aviso)', r.extra);
  list('NÃO VERIFICADOS, só em desenvolvimento (aviso)', r.unverified);
  list('SEM COORDENADA, fora do mapa (aviso)', r.unmapped);
  console.log(r.ok ? 'Catálogo OK.' : 'Catálogo com erros.');
  if (!r.ok) process.exitCode = 1;
}
