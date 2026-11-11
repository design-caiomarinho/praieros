import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Catalog } from '../catalog/types.ts';
import type { StoredBulletin } from '../inema/bulletin.ts';
import {
  buildSiteModel,
  type BuildOptions,
  type SiteModel,
} from './build-beach-models.ts';

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
  const catalog: Catalog = JSON.parse(
    await readFile(`${dataDir}catalog/salvador.json`, 'utf8'),
  );
  return { bulletins, catalog };
}

/** Em páginas: `loadSalvadorModel({ includeUnverified: import.meta.env.DEV })`. */
export async function loadSalvadorModel(
  options: BuildOptions = {},
  dataDir?: string,
): Promise<SiteModel> {
  const { bulletins, catalog } = await loadSalvadorInputs(dataDir);
  return buildSiteModel(bulletins, catalog, options);
}
