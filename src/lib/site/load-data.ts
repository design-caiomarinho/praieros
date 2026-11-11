import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrateCatalog } from '../catalog/review.ts';
import type { ReferenceFile } from '../catalog/reference.ts';
import type { Catalog } from '../catalog/types.ts';
import type { StoredBulletin } from '../inema/bulletin.ts';
import {
  buildSiteModel,
  type BuildOptions,
  type SiteModel,
} from './build-beach-models.ts';

/**
 * Nomes do boletim que não são praia. O Inema os lista, mas o Praieros mostra só praias:
 * ficam fora do mapa, da busca e do resumo (decisão do produto, docs/decisions.md).
 */
export const NOT_BEACHES = [
  'Santa Maria',
  'Lagoa de Pituaçu',
  'Lagoa de Abaete',
];

const DATA = fileURLToPath(new URL('../../../data/', import.meta.url));

/** Único ponto de I/O da camada de dados: lê os boletins de Salvador e o catálogo. */
export async function loadSalvadorInputs(dataDir = DATA) {
  const dir = `${dataDir}bulletins/`;
  const files = (await readdir(dir)).filter((f) =>
    f.endsWith('-salvador.json'),
  );
  const bulletins: StoredBulletin[] = [];
  for (const f of files) {
    bulletins.push(JSON.parse(await readFile(`${dir}${f}`, 'utf8')));
  }
  const catalog: Catalog = migrateCatalog(
    JSON.parse(await readFile(`${dataDir}catalog/salvador.json`, 'utf8')),
  );
  const optional = async <T>(file: string, fallback: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(`${dataDir}catalog/${file}`, 'utf8'));
    } catch {
      return fallback;
    }
  };
  // Arquivos opcionais: sem eles o site funciona só com o boletim e o catálogo.
  const references = await optional<ReferenceFile>('reference-beaches.json', {
    schemaVersion: 1,
    region: 'salvador',
    beaches: [],
  });
  const referenceExclude = await optional<string[]>(
    'reference-exclude.json',
    [],
  );
  const aliases = await optional<Record<string, string>>(
    'beach-aliases.json',
    {},
  );
  return {
    bulletins,
    catalog,
    references: references.beaches,
    referenceExclude,
    aliases,
  };
}

/** Em páginas: `loadSalvadorModel({ includeUnverified: import.meta.env.DEV })`. */
export async function loadSalvadorModel(
  options: BuildOptions = {},
  dataDir?: string,
): Promise<SiteModel> {
  const { bulletins, catalog, references, referenceExclude, aliases } =
    await loadSalvadorInputs(dataDir);
  return buildSiteModel(bulletins, catalog, {
    excluded: NOT_BEACHES,
    references,
    referenceExclude,
    aliases,
    ...options,
  });
}
