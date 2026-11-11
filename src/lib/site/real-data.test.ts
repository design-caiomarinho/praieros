import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../catalog/validate-catalog.ts';
import { currentBulletin } from '../rules/evaluate.ts';
import { beachSlug, buildSiteModel } from './build-beach-models.ts';
import { loadSalvadorInputs } from './load-data.ts';

// Dados reais versionados. Coordenadas ainda pendentes não reprovam: só o resto.
describe('catálogo e boletins reais de Salvador', () => {
  it('todo código do boletim atual existe no catálogo, sem dado inválido', async () => {
    const { bulletins, catalog } = await loadSalvadorInputs();
    const report = validateCatalog(
      catalog,
      currentBulletin(bulletins)?.points ?? [],
    );
    expect(report.missing).toEqual([]);
    expect(report.invalid).toEqual([]);
  });

  it('slugs das praias são únicos', async () => {
    const { bulletins, catalog } = await loadSalvadorInputs();
    const slugs = buildSiteModel(bulletins, catalog).beaches.map((b) =>
      beachSlug(b.name),
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
