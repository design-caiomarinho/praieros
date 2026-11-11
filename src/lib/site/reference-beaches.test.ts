import { describe, expect, it } from 'vitest';
import type { Catalog } from '../catalog/types.ts';
import type { RuleBulletin } from '../rules/types.ts';
import { buildSiteModel } from './build-beach-models.ts';
import { toMarkers } from './map-markers.ts';
import { toPanelData } from './panel-props.ts';

// Boletins sintéticos: só aqui, nunca em data/bulletins/.
const bulletin = (n: number, beaches: [string, string][]): RuleBulletin => ({
  number: n,
  year: 2026,
  issuedAt: `2026-01-${String(n).padStart(2, '0')}`,
  points: beaches.map(([code, beach]) => ({
    code,
    beach,
    category: 'Própria' as const,
  })),
});

const catalogOf = (
  beaches: { name: string; code: string; lat: number; lng: number }[],
) =>
  ({
    schemaVersion: 4,
    region: 'salvador',
    beaches: beaches.map((b) => ({
      name: b.name,
      neighborhood: 'Bairro',
      neighborhoodSource: null,
      neighborhoodProposals: [],
      neighborhoodVerified: true,
      proposalNote: null,
      points: [
        {
          code: b.code,
          lat: b.lat,
          lng: b.lng,
          source: null,
          proposals: [],
          verified: true,
        },
      ],
    })),
  }) as unknown as Catalog;

const bulletins = [
  bulletin(1, [
    ['A1', 'Praia A'],
    ['B1', 'Praia B'],
  ]),
  bulletin(2, [['B1', 'Praia B']]),
];
const catalog = catalogOf([
  { name: 'Praia A', code: 'A1', lat: -12.9, lng: -38.4 },
  { name: 'Praia B', code: 'B1', lat: -12.95, lng: -38.45 },
]);
const references = [{ name: 'Praia Solta', lat: -13, lng: -38.5 }];

describe('praia de referência no modelo do site', () => {
  const site = buildSiteModel(bulletins, catalog, { references });
  const ref = site.beaches.find((b) => b.name === 'Praia Solta')!;

  it('é sem resultado, sem faixa, sem pontos, e aponta para o boletim atual', () => {
    expect(ref.isReference).toBe(true);
    expect(ref.points).toEqual([]);
    expect(ref.banner).toBe('none');
    expect(ref.worstStatus).toBe('no-result');
    expect(ref.notInCurrentBulletin).toBe(true);
    expect(ref.referenceBulletin?.number).toBe(2);
  });

  it('a ficha diz que não consta no boletim e não tem pontos de coleta', () => {
    const panel = toPanelData(ref, site.current, new Map())!;
    expect(panel.note).toBe('Esta praia não consta no boletim nº 2/2026.');
    expect(panel.notice).toBe('no-result');
    expect(panel.points).toEqual([]);
    expect(panel.bulletin.date).toBe('02/01/2026');
  });

  it('tem um marcador "Sem resultado" na posição da referência', () => {
    const m = toMarkers([ref]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      status: 'no-result',
      lat: -13,
      lng: -38.5,
      reference: true,
    });
    expect(m[0]!.ariaLabel).toContain('Sem resultado');
    expect(m[0]!.ariaLabel).not.toContain('Ponto de coleta');
  });

  it('o resumo (D2) conta só pontos de coleta, sem as referências', () => {
    expect(site.summary).toEqual(buildSiteModel(bulletins, catalog).summary);
  });

  it('referência excluída some; referência com nome do boletim não duplica', () => {
    const excluded = buildSiteModel(bulletins, catalog, {
      references,
      referenceExclude: ['praia solta'],
    });
    expect(excluded.beaches.some((b) => b.isReference)).toBe(false);
    const dup = buildSiteModel(bulletins, catalog, {
      references: [{ name: 'Praia B', lat: 0, lng: 0 }],
    });
    expect(dup.beaches.filter((b) => b.name === 'Praia B')).toHaveLength(1);
    expect(dup.beaches.some((b) => b.isReference)).toBe(false);
  });
});

describe('praia que saiu do boletim atual mantém ponto e posição', () => {
  it('desatualizada: último status, data da última aparição e marcador "!"', () => {
    const site = buildSiteModel(bulletins, catalog, { references });
    const a = site.beaches.find((b) => b.name === 'Praia A')!;
    expect(a.banner).toBe('outdated');
    expect(a.referenceBulletin?.number).toBe(1);
    expect(a.points[0]).toMatchObject({
      code: 'A1',
      status: 'suitable',
      onMap: true,
    });
    expect(toMarkers([a])[0]).toMatchObject({
      status: 'outdated',
      lat: -12.9,
      lng: -38.4,
    });
  });
});
