import { describe, expect, it } from 'vitest';
import { assembleChains, distanceM, type Boundary } from './geo.ts';
import {
  beachNameQueries,
  coastFromElements,
  computeLevelChecks,
  descriptionReferences,
  isLagoon,
  localityQueries,
  orderReport,
  referenceMatches,
  planLevels,
  type Coast,
  type LevelsInput,
} from './levels.ts';
import type { GeomElement } from './placement.ts';
import type { NominatimResult } from './propose.ts';
import type { Catalog, CatalogPoint } from './types.ts';

// Litoral reto de oeste a leste na latitude -12,95 (≈ 10,9 km); 0,001° de longitude ≈ 108 m.
const LAT = -12.95;
const line = [
  { lat: LAT, lng: -38.5 },
  { lat: LAT, lng: -38.4 },
];
const coast: Coast = {
  geometry: { lines: [{ pts: line, closed: false }], ids: [] },
  chain: line,
};
const boundary: Boundary = {
  outer: [
    [
      { lat: -13.0, lng: -38.6 },
      { lat: -13.0, lng: -38.3 },
      { lat: -12.9, lng: -38.3 },
      { lat: -12.9, lng: -38.6 },
      { lat: -13.0, lng: -38.6 },
    ],
  ],
  inner: [],
};
const DAY = '2026-11-12';

const point = (
  code: string,
  extra: Partial<CatalogPoint> = {},
): CatalogPoint => ({
  code,
  lat: null,
  lng: null,
  source: null,
  proposals: [],
  verified: false,
  ...extra,
});
const placedG = (code: string, lng: number): CatalogPoint =>
  point(code, {
    lat: LAT,
    lng,
    source: {
      provider: 'auto',
      method: 'auto-placed',
      level: 'g',
      basis: 'geometry-spread',
      confidence: 'low',
      reason: 'teste',
      query: null,
      geometry: [],
      osm: null,
      placedAt: DAY,
    },
  });
const catalog = (beaches: [string, CatalogPoint[]][]): Catalog => ({
  schemaVersion: 4,
  region: 'salvador',
  beaches: beaches.map(([name, points]) => ({
    name,
    neighborhood: null,
    neighborhoodSource: null,
    neighborhoodProposals: [],
    neighborhoodVerified: false,
    proposalNote: null,
    points,
  })),
});
const result = (
  name: string,
  lat: number,
  lng: number,
  category = 'natural',
  type = 'beach',
): NominatimResult => ({
  osm_type: 'node',
  osm_id: 5,
  lat: String(lat),
  lon: String(lng),
  display_name: `${name}, Salvador`,
  name,
  category,
  type,
});
const run = (over: Partial<LevelsInput> & Pick<LevelsInput, 'catalog'>) =>
  planLevels({
    order: [],
    locations: {},
    boundary,
    coast,
    lookup: {},
    today: DAY,
    ...over,
  });
const planOf = (r: ReturnType<typeof run>, beach: string, i = 0) =>
  r.plans.get(beach)![i]!;

describe('descriptionReferences', () => {
  it('rua com abreviatura, hospital e trecho genérico descartado', () => {
    expect(
      descriptionReferences(
        'Rua Prof. Roberto Correia, junto à descida de acesso à praia, fundo do Hospital São Jorge.',
      ),
    ).toEqual(['Rua Prof. Roberto Correia', 'Hospital São Jorge']);
  });
  it('avenida, "entre X e Y" e artigo inicial', () => {
    expect(
      descriptionReferences(
        'Na Av. Contorno, entre a Marina e o Restaurante do Amado.',
      ),
    ).toEqual(['Av. Contorno', 'Marina', 'Restaurante do Amado']);
  });
  it('parênteses viram outra referência, sem "antigo"', () => {
    expect(
      descriptionReferences(
        'Em frente ao Colégio da PM (antigo Colégio João Florêncio Gomes).',
      ),
    ).toEqual(['Colégio da PM', 'Colégio João Florêncio Gomes']);
  });
  it('só trechos genéricos ou vazio: nenhuma referência', () => {
    expect(
      descriptionReferences(
        'Ao lado da quadra de esportes, em frente à rampa de acesso à praia.',
      ),
    ).toEqual([]);
    expect(descriptionReferences(null)).toEqual([]);
  });
  it('no máximo 4', () => {
    expect(
      descriptionReferences(
        'Rua A Um, Rua B Dois, Rua C Três, Rua D Quatro, Rua E Cinco',
      ).length,
    ).toBe(4);
  });
});

describe('consultas dos níveis b e c', () => {
  it('b usa a dica do OSM; c lê o nome da praia como localidade', () => {
    const hints = { Placafor: 'Placaford' };
    expect(beachNameQueries('Placafor', hints)[0]).toContain('Placaford');
    expect(localityQueries('Praia de Roma', null)).toEqual([
      'Roma, Salvador, Bahia',
    ]);
    expect(
      localityQueries('Roma', 'No bairro de Boa Viagem, perto da escada.'),
    ).toContain('Boa Viagem, Salvador, Bahia');
  });
});

describe('litoral e verificações a–e', () => {
  it('cadeias: junta trechos pelas pontas e ordena pela mais longa', () => {
    const p = (lng: number) => ({ lat: LAT, lng });
    const chains = assembleChains([
      [p(-38.4), p(-38.45)],
      [p(-38.5), p(-38.45)],
      [p(-38.2), p(-38.19)],
    ]);
    expect(chains).toHaveLength(2);
    expect(chains[0]!).toHaveLength(3);
  });
  it('coastFromElements usa só ways e escolhe a cadeia mais longa', () => {
    const els: GeomElement[] = [
      {
        type: 'way',
        id: 1,
        geometry: line.map((q) => ({ lat: q.lat, lon: q.lng })),
      },
      {
        type: 'way',
        id: 2,
        geometry: [
          { lat: -12.9, lon: -38.3 },
          { lat: -12.9, lon: -38.299 },
        ],
      },
    ];
    expect(coastFromElements(els).chain).toHaveLength(2);
  });
  it('litoral a até 150 m passa; a mais de 150 m, não', () => {
    const at = (dLat: number) => ({ lat: LAT + dLat, lng: -38.45 });
    expect(
      computeLevelChecks(at(0.001), [], coast, boundary).nearCoast!.status,
    ).toBe('pass'); // ≈ 111 m
    expect(
      computeLevelChecks(at(0.002), [], coast, boundary).nearCoast!.status,
    ).toBe('fail'); // ≈ 222 m
  });
  it('fora do polígono e a menos de 40 m de outro ponto falham', () => {
    expect(
      computeLevelChecks({ lat: -12.5, lng: -38.45 }, [], coast, boundary)
        .inSalvador.status,
    ).toBe('fail');
    const here = { lat: LAT, lng: -38.45 };
    expect(
      computeLevelChecks(here, [{ lat: LAT, lng: -38.4503 }], coast, boundary)
        .minSpacing.status,
    ).toBe('fail');
  });
});

describe('orderReport (a ordem do boletim acompanha o litoral?)', () => {
  const a = (code: string, index: number, lng: number) => ({
    code,
    index,
    pos: { lat: LAT, lng },
  });
  it('ordem monotônica: tau 1, consistente, sem inversões', () => {
    const r = orderReport(
      [a('A', 0, -38.49), a('B', 1, -38.47), a('C', 2, -38.45)],
      line,
    );
    expect(r).toMatchObject({ tau: 1, consistent: true, direction: 1 });
    expect(r.inversions).toEqual([]);
  });
  it('ordem no sentido inverso do litoral também é consistente, com direction -1', () => {
    const r = orderReport(
      [a('A', 0, -38.45), a('B', 1, -38.47), a('C', 2, -38.49)],
      line,
    );
    expect(r).toMatchObject({ tau: -1, consistent: true, direction: -1 });
  });
  it('uma inversão entre 6 pares: tau 0,667, inconsistente, lista o par', () => {
    const r = orderReport(
      [
        a('A', 0, -38.49),
        a('B', 1, -38.45),
        a('C', 2, -38.47),
        a('D', 3, -38.43),
      ],
      line,
    );
    expect(r.tau).toBeCloseTo(0.667, 2);
    expect(r.consistent).toBe(false);
    expect(r.inversions).toEqual([['B', 'C']]);
  });
  it('ponto a mais de 150 m da cadeia fica de fora da conta', () => {
    const far = { code: 'L', index: 1, pos: { lat: LAT + 0.01, lng: -38.47 } };
    const r = orderReport([a('A', 0, -38.49), far, a('C', 2, -38.45)], line);
    expect(r.excluded).toEqual(['L']);
    expect(r.used).toBe(2);
  });
});

describe('planLevels', () => {
  const cat = () =>
    catalog([
      ['Praia A', [placedG('A1', -38.48)]],
      ['Praia B', [point('B1')]],
      ['Praia C', [placedG('C1', -38.44)]],
    ]);
  const order = ['A1', 'B1', 'C1'];

  it('a) uma referência da descrição, a até 150 m do litoral: nível a, confiança baixa', () => {
    const r = run({
      catalog: cat(),
      order,
      locations: { B1: 'Em frente ao Hospital São Jorge.' },
      lookup: {
        'Hospital São Jorge, Salvador, Bahia': [
          result(
            'Hospital São Jorge',
            LAT - 0.0005,
            -38.46,
            'amenity',
            'hospital',
          ),
        ],
      },
    });
    expect(planOf(r, 'Praia B')).toMatchObject({
      kind: 'placed',
      source: { level: 'a', basis: 'references', confidence: 'low' },
      checks: { nearCoast: { status: 'pass' }, inSalvador: { status: 'pass' } },
    });
  });
  it('a, b, c: a posição é levada para a linha da costa (areia e mar), não fica na rua nem no prédio', () => {
    const r = run({
      catalog: cat(),
      order,
      locations: { B1: 'Em frente ao Hospital São Jorge.' },
      lookup: {
        'Hospital São Jorge, Salvador, Bahia': [
          result(
            'Hospital São Jorge',
            LAT - 0.001,
            -38.46,
            'amenity',
            'hospital',
          ), // ≈ 111 m da costa
        ],
      },
    });
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({ kind: 'placed', source: { level: 'a' } });
    if (p.kind === 'placed') {
      expect(p.lat).toBeCloseTo(LAT, 6);
      expect(p.checks.nearCoast!.meters).toBeLessThan(1);
      expect((p.source as { reason: string }).reason).toContain('ajustado');
    }
  });
  it('a) referências que se afastam mais de 300 m entre si: nível recusado, com o motivo, e cai para o d', () => {
    const r = run({
      catalog: cat(),
      order,
      locations: { B1: 'Rua Alfa Um, em frente ao Hospital Beta.' },
      lookup: {
        'Rua Alfa Um, Salvador, Bahia': [
          result('Rua Alfa Um', LAT, -38.47, 'highway', 'residential'),
        ],
        'Hospital Beta, Salvador, Bahia': [
          result('Hospital Beta', LAT, -38.46, 'amenity', 'hospital'),
        ], // ≈ 1 km
      },
    });
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({ kind: 'placed', source: { level: 'd' } });
    expect((p as { source: { reason: string } }).source.reason).toContain(
      'discordam',
    );
  });
  it('a) referência a mais de 150 m do litoral: recusada, e o motivo diz a distância', () => {
    const r = run({
      catalog: cat(),
      order,
      locations: { B1: 'Em frente ao Hospital São Jorge.' },
      lookup: {
        'Hospital São Jorge, Salvador, Bahia': [
          result(
            'Hospital São Jorge',
            LAT - 0.004,
            -38.46,
            'amenity',
            'hospital',
          ),
        ],
      },
    });
    const p = planOf(r, 'Praia B') as {
      source: { level: string; reason: string };
    };
    expect(p.source.level).toBe('d');
    expect(p.source.reason).toMatch(/a: a \d+ m do litoral/);
  });
  it('b) nome da praia no Nominatim, dentro de Salvador: nível b, confiança baixa', () => {
    const r = run({
      catalog: catalog([
        ['Roma', [point('R1')]],
        ['Vizinha', [placedG('V1', -38.44)]],
      ]),
      order: ['R1', 'V1'],
      lookup: {
        'Roma, Salvador, Bahia': [
          result('Praia de Roma', LAT - 0.0003, -38.47),
        ],
      },
    });
    expect(planOf(r, 'Roma')).toMatchObject({
      kind: 'placed',
      source: { level: 'b', basis: 'beach-name', confidence: 'low' },
    });
  });
  it('b) com a dica do OSM busca e aceita o nome do OSM', () => {
    const r = run({
      catalog: catalog([['Placafor', [point('P1')]]]),
      order: ['P1'],
      hints: { Placafor: 'Placaford' },
      lookup: {
        'Placaford, Salvador, Bahia': [
          result('Praia de Placaford', LAT, -38.47),
        ],
      },
    });
    expect(planOf(r, 'Placafor')).toMatchObject({ source: { level: 'b' } });
  });
  it('c) localidade (bairro): nível c, confiança muito baixa', () => {
    const r = run({
      catalog: catalog([['Roma', [point('R1')]]]),
      order: ['R1'],
      lookup: {
        'Roma, Salvador, Bahia': [
          result('Roma', LAT - 0.0004, -38.47, 'place', 'suburb'),
        ],
      },
    });
    expect(planOf(r, 'Roma')).toMatchObject({
      kind: 'placed',
      source: { level: 'c', basis: 'locality', confidence: 'very-low' },
    });
  });
  it('d) interpola pela ordem entre os vizinhos posicionados, ao longo do litoral', () => {
    const r = run({ catalog: cat(), order });
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({
      kind: 'placed',
      source: {
        level: 'd',
        basis: 'order-interpolation',
        confidence: 'very-low',
      },
    });
    if (p.kind === 'placed') {
      expect(p.lng).toBeCloseTo(-38.46, 3); // no meio entre -38,48 e -38,44
      expect(p.checks.nearCoast!.status).toBe('pass');
      expect((p.source as { reason: string }).reason).toContain('a:');
      expect((p.source as { reason: string }).reason).toContain('c:');
    }
  });
  it('e) ordem inconsistente: último recurso, no litoral mais perto do centro dos vizinhos', () => {
    const c = catalog([
      ['Praia A', [placedG('A1', -38.49)]],
      ['Praia B', [point('B1')]],
      ['Praia C', [placedG('C1', -38.45)]],
      ['Praia D', [placedG('D1', -38.47)]],
      ['Praia E', [placedG('E1', -38.43)]],
    ]);
    // ordem do boletim A, B, C, D, E; no litoral C vem depois de D: uma inversão (tau 0,667).
    const r = run({ catalog: c, order: ['A1', 'B1', 'C1', 'D1', 'E1'] });
    expect(r.order.consistent).toBe(false);
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({
      kind: 'placed',
      source: { level: 'e', basis: 'coast-snap', confidence: 'very-low' },
    });
    if (p.kind === 'placed') {
      expect(p.lng).toBeCloseTo(-38.47, 3); // centro de A1 (-38,49) e C1 (-38,45)
      expect(p.lat).toBeCloseTo(LAT, 5);
      expect((p.source as { reason: string }).reason).toContain(
        'd: a ordem do boletim não acompanha o litoral',
      );
    }
  });
  it('nenhum ponto fica de fora: sem vizinho dos dois lados também cai no e', () => {
    const r = run({
      catalog: catalog([
        ['Praia B', [point('B1')]],
        ['Praia C', [placedG('C1', -38.44)]],
      ]),
      order: ['B1', 'C1'],
    });
    expect(planOf(r, 'Praia B')).toMatchObject({
      kind: 'placed',
      source: { level: 'e' },
    });
  });
  it('dois pontos da mesma praia no mesmo resultado: o segundo é deslocado ao longo do litoral (≥ 40 m)', () => {
    const r = run({
      catalog: catalog([
        ['Roma', [point('R1'), point('R2')]],
        ['Vizinha', [placedG('V1', -38.44)]],
      ]),
      order: ['R1', 'R2', 'V1'],
      lookup: {
        'Roma, Salvador, Bahia': [result('Praia de Roma', LAT, -38.47)],
      },
    });
    const [a, b] = r.plans.get('Roma')!;
    expect(a).toMatchObject({ kind: 'placed', source: { level: 'b' } });
    expect(b).toMatchObject({ kind: 'placed', source: { level: 'b' } });
    if (a?.kind === 'placed' && b?.kind === 'placed') {
      expect(distanceM(a, b)).toBeGreaterThanOrEqual(40);
      expect((b.source as { reason: string }).reason).toContain('deslocado');
      expect(b.checks.minSpacing.status).toBe('pass');
      expect(a.checks.minSpacing.status).toBe('pass'); // verificação final
    }
  });
  it('nunca mexe em ponto verificado ou manual, nem em ponto que já tem posição', () => {
    const verified = point('V1', { lat: LAT, lng: -38.47, verified: true });
    const manual = point('M1', {
      source: { provider: 'manual', method: 'manual', editedAt: DAY },
    });
    const r = run({
      catalog: catalog([
        ['Praia V', [verified, manual, placedG('G1', -38.44)]],
      ]),
      order: ['V1', 'M1', 'G1'],
    });
    expect(r.plans.get('Praia V')!.map((p) => p.kind)).toEqual([
      'skip',
      'skip',
      'skip',
    ]);
  });
  it('sem nenhum vizinho posicionado e sem resultado, o ponto fica sem posição com o motivo de cada nível', () => {
    const r = run({
      catalog: catalog([['Praia B', [point('B1')]]]),
      order: ['B1'],
    });
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({ kind: 'unplaced' });
    if (p.kind === 'unplaced') {
      for (const lv of ['a:', 'b:', 'c:', 'd:', 'e:'])
        expect(p.note).toContain(lv);
    }
  });
});

describe('referenceMatches (o resultado é a referência citada?)', () => {
  it('aceita quando todas as palavras significativas estão no nome do resultado', () => {
    expect(
      referenceMatches('Rua Morro da Paciência', 'Rua Morro da Paciência'),
    ).toBe(true);
    expect(referenceMatches('Av. Oceânica', 'Avenida Oceânica')).toBe(true);
    expect(
      referenceMatches('Hospital Espanhol', 'Hospital Espanhol de Salvador'),
    ).toBe(true);
  });
  it('recusa outro lugar com nome parecido (igreja da Ilha de Maré no caso do Rio Vermelho)', () => {
    expect(
      referenceMatches(
        'igreja Nossa Senhora de Santana',
        'Igreja Nossa Senhora das Neves',
      ),
    ).toBe(false);
  });
  it('nível a ignora o primeiro resultado de outro nome e usa o que combina', () => {
    const r = run({
      catalog: catalog([
        ['Praia A', [placedG('A1', -38.48)]],
        ['Praia B', [point('B1')]],
        ['Praia C', [placedG('C1', -38.44)]],
      ]),
      order: ['A1', 'B1', 'C1'],
      locations: { B1: 'Próximo à igreja Nossa Senhora de Santana.' },
      lookup: {
        'igreja Nossa Senhora de Santana, Salvador, Bahia': [
          result(
            'Igreja Nossa Senhora das Neves',
            LAT,
            -38.3,
            'amenity',
            'place_of_worship',
          ),
          result(
            'Igreja Nossa Senhora de Santana',
            LAT - 0.0004,
            -38.46,
            'amenity',
            'place_of_worship',
          ),
        ],
      },
    });
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({ kind: 'placed', source: { level: 'a' } });
    if (p.kind === 'placed') expect(p.lng).toBeCloseTo(-38.46, 3);
  });
  it('se só há resultado de outro nome, o nível a é recusado', () => {
    const r = run({
      catalog: catalog([['Praia B', [point('B1')]]]),
      order: ['B1'],
      locations: { B1: 'Próximo à igreja Nossa Senhora de Santana.' },
      lookup: {
        'igreja Nossa Senhora de Santana, Salvador, Bahia': [
          result(
            'Igreja Nossa Senhora das Neves',
            LAT,
            -38.46,
            'amenity',
            'place_of_worship',
          ),
        ],
      },
    });
    const p = planOf(r, 'Praia B');
    expect(p).toMatchObject({ kind: 'unplaced' });
    if (p.kind === 'unplaced')
      expect(p.note).toContain('a: nenhuma referência');
  });
});

describe('lagoa não é praia do mar', () => {
  it('isLagoon reconhece "Lagoa de …" e não confunde com praia', () => {
    expect(isLagoon('Lagoa de Pituaçu')).toBe(true);
    expect(isLagoon('Lagoa de Abaete')).toBe(true);
    expect(isLagoon('Praia da Lagoa')).toBe(false);
  });
  it('nível b: a posição da lagoa NÃO é levada à costa do mar e não pede litoral', () => {
    const r = run({
      catalog: catalog([['Lagoa de Pituaçu', [point('L1')]]]),
      order: ['L1'],
      lookup: {
        'Lagoa de Pituaçu, Salvador, Bahia': [
          result('Lagoa de Pituaçu', LAT - 0.01, -38.45, 'natural', 'water'), // ≈ 1,1 km da costa
        ],
      },
    });
    const p = planOf(r, 'Lagoa de Pituaçu');
    expect(p).toMatchObject({
      kind: 'placed',
      source: { level: 'b' },
      checks: { nearCoast: { status: 'n/a' } },
    });
    if (p.kind === 'placed') expect(p.lat).toBeCloseTo(LAT - 0.01, 5); // onde a lagoa está
  });
  it('níveis d e e não se aplicam: sem resultado, a lagoa fica sem posição com o motivo (nunca no mar)', () => {
    const r = run({
      catalog: catalog([
        ['Praia A', [placedG('A1', -38.48)]],
        ['Lagoa de Abaete', [point('L1')]],
        ['Praia C', [placedG('C1', -38.44)]],
      ]),
      order: ['A1', 'L1', 'C1'],
    });
    const p = planOf(r, 'Lagoa de Abaete');
    expect(p).toMatchObject({ kind: 'unplaced' });
    if (p.kind === 'unplaced') expect(p.note).toContain('lagoa não é litoral');
  });
});
