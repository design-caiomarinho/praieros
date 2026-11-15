import { loadSalvadorInputs, NOT_BEACHES } from './load-data.ts';
import { buildSiteModel } from './build-beach-models.ts';

/**
 * Lê os dados e monta o modelo do site (mesmo para a página inicial e as páginas de
 * compartilhamento). Pontos com `verified: false` só aparecem em desenvolvimento.
 */
export async function loadSite(options: { includeUnverified?: boolean } = {}) {
  const inputs = await loadSalvadorInputs();
  const site = buildSiteModel(inputs.bulletins, inputs.catalog, {
    includeUnverified: options.includeUnverified ?? import.meta.env.DEV,
    excluded: NOT_BEACHES,
    references: inputs.references,
    referenceExclude: inputs.referenceExclude,
    aliases: inputs.aliases,
    neighborhoodNames: inputs.neighborhoodNames,
  });
  return { ...inputs, site };
}
