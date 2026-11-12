import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogSource } from '../catalog/types.ts';
import type { RuleBulletin } from '../rules/types.ts';
import { buildSiteModel } from './build-beach-models.ts';

// Regra de exibição do bairro (produção x desenvolvimento) e tabela de nomes aprovada.
// Dados sintéticos: só aqui, nunca em data/.

const bulletins: RuleBulletin[] = [
  {
    number: 1,
    year: 2026,
    issuedAt: '2026-01-01',
    points: [
      { code: 'P1', beach: 'A', category: 'Própria' },
      { code: 'P2', beach: 'B', category: 'Própria' },
      { code: 'P3', beach: 'C', category: 'Própria' },
      { code: 'P4', beach: 'D', category: 'Própria' },
    ],
  },
];

const polygon = (osmName: string): CatalogSource => ({
  provider: 'osm',
  method: 'polygon',
  confidence: 'high',
  osmType: 'relation',
  osmId: 1,
  osmName,
  reason: 'teste',
  fetchedAt: '2026-11-12',
});
const reverse: CatalogSource = {
  provider: 'osm',
  method: 'reverse',
  confidence: 'medium',
  query: '',
  osmType: 'way',
  osmId: 1,
  displayName: '',
  fetchedAt: '2026-11-12',
};

const entry = (
  name: string,
  code: string,
  neighborhood: string | null,
  source: CatalogSource | null,
  verified: boolean,
) => ({
  name,
  neighborhood,
  neighborhoodSource: source,
  neighborhoodProposals: [],
  neighborhoodVerified: verified,
  proposalNote: null,
  points: [
    {
      code,
      lat: -12.97,
      lng: -38.5,
      source: null,
      proposals: [],
      verified: true,
    },
  ],
});

const catalog: Catalog = {
  schemaVersion: 4,
  region: 'salvador',
  beaches: [
    entry('A', 'P1', 'Rio Vemelho', polygon('Rio Vemelho'), false),
    entry('B', 'P2', 'Bairro antigo', reverse, false),
    entry('C', 'P3', 'Rio Vemelho', null, true), // conferido à mão
    entry('D', 'P4', null, null, false), // automático não preencheu
  ],
};

const names = { 'Rio Vemelho': 'Rio Vermelho' };
const hood = (m: ReturnType<typeof buildSiteModel>, n: string) =>
  m.beaches.find((b) => b.name === n)?.neighborhood;

describe('bairro em produção', () => {
  const m = buildSiteModel(bulletins, catalog, { neighborhoodNames: names });
  it('automático por polígono aparece, com a tabela de nomes aplicada', () => {
    expect(hood(m, 'A')).toBe('Rio Vermelho');
  });
  it('reverse antigo (não conferido) não aparece', () => {
    expect(hood(m, 'B')).toBeNull();
  });
  it('bairro conferido à mão prevalece e não passa pela tabela de nomes', () => {
    expect(hood(m, 'C')).toBe('Rio Vemelho');
  });
  it('praia sem bairro: nada inventado', () => {
    expect(hood(m, 'D')).toBeNull();
  });
  it('sem a tabela, o nome do OSM é mantido', () => {
    const raw = buildSiteModel(bulletins, catalog);
    expect(hood(raw, 'A')).toBe('Rio Vemelho');
  });
});

describe('bairro em desenvolvimento', () => {
  it('reverse antigo aparece só em desenvolvimento', () => {
    const m = buildSiteModel(bulletins, catalog, { includeUnverified: true });
    expect(hood(m, 'B')).toBe('Bairro antigo');
  });
});

describe('praia de referência', () => {
  const refs = [
    {
      name: 'Praia Ref',
      lat: -12.97,
      lng: -38.5,
      neighborhood: 'Rio Vemelho',
      neighborhoodSource: { method: 'polygon' },
    },
    {
      name: 'Praia Antiga',
      lat: -12.98,
      lng: -38.51,
      neighborhood: 'Outro',
      neighborhoodSource: { method: 'reverse' },
    },
  ];
  const m = buildSiteModel(bulletins, catalog, {
    references: refs,
    neighborhoodNames: names,
  });
  it('bairro por polígono aparece; reverse só em desenvolvimento', () => {
    expect(hood(m, 'Praia Ref')).toBe('Rio Vermelho');
    expect(hood(m, 'Praia Antiga')).toBeNull();
    const dev = buildSiteModel(bulletins, catalog, {
      references: refs,
      includeUnverified: true,
    });
    expect(hood(dev, 'Praia Antiga')).toBe('Outro');
  });
});
