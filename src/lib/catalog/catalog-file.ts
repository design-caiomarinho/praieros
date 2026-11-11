import { readFile, rename, writeFile } from 'node:fs/promises';
import { migrateCatalog, validateForWrite } from './review.ts';
import type { Catalog } from './types.ts';

/** Lê o catálogo (aceita v3 e v4; sempre devolve v4). */
export async function readCatalogFile(path: string): Promise<Catalog> {
  return migrateCatalog(JSON.parse(await readFile(path, 'utf8')));
}

/** Formato gravado: JSON com 2 espaços e quebra de linha final (igual ao Prettier). */
export const serializeCatalog = (catalog: Catalog) =>
  `${JSON.stringify(catalog, null, 2)}\n`;

/**
 * Valida e grava de forma atômica: escreve um arquivo temporário ao lado e o renomeia sobre o
 * original, então uma falha no meio nunca deixa o catálogo pela metade. `prev` é o que está
 * gravado agora (a validação compara com ele). Devolve a lista de erros; vazia = gravou.
 */
export async function writeCatalogFile(
  path: string,
  prev: Catalog,
  next: Catalog,
): Promise<string[]> {
  const errors = validateForWrite(prev, next);
  if (errors.length > 0) return errors;
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, serializeCatalog(next), 'utf8');
  await rename(tmp, path);
  return [];
}
