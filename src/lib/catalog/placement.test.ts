import { describe, expect, it } from 'vitest';
import {
  assembleRings,
  distanceM,
  distanceToGeometryM,
  distanceToSegmentM,
  inBoundary,
  spineOf,
  lengthM,
  type Boundary,
  type Geometry,
} from './geo.ts';
import {
  applyPlans,
  boundaryFromRelation,
  computeChecks,
  geometryForBeach,
  MAX_DISTANCE_TO_BEACH_M,
  MIN_SPACING_M,
  accuracyOf,
  planBeach,
  pointState,
  shownInProduction,
  type GeomElement,
  type PlanInput,
} from './placement.ts';
import { validateForWrite } from './review.ts';
import type { Catalog, CatalogPoint, OsmSource } from './types.ts';

// Praia reta de leste a oeste na latitude -12,95, com cerca de 1.090 m (1° de longitude ≈ 108,5 km).
const LAT = -12.95;
const beachLine: Geometry = {
  lines: [
    {
      closed: false,
      pts: [
        { lat: LAT, lng: -38.5 },
        { lat: LAT, lng: -38.49 },
      ],
    },
  ],
  ids: ['way/1'],
};
const boundary: Boundary = {
  outer: [
    [
      { lat: -13.0, lng: -38.6 },
      { lat: -13.0, lng: -38.4 },
      { lat: -12.9, lng: -38.4 },
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
const entry = (points: CatalogPoint[]) => ({
  name: 'Praia Teste',
  neighborhood: null,
  neighborhoodSource: null,
  neighborhoodProposals: [],
  neighborhoodVerified: false,
  proposalNote: null,
  points,
});
const input = (
  points: CatalogPoint[],
  extra: Partial<PlanInput> = {},
): PlanInput => ({
  beach: entry(points),
  locations: {},
  geometry: beachLine,
  boundary,
  clueResults: {},
  today: DAY,
  ...extra,
});
const clue = (name: string, lat: number, lng: number) => ({
  osm_type: 'node',
  osm_id: 77,
  lat: String(lat),
  lon: String(lng),
  display_name: `${name}, Salvador`,
  name,
});

describe('geo', () => {
  it('distância entre pontos: 0,001° de latitude ≈ 111 m', () => {
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 })).toBeCloseTo(
      111.2,
      0,
    );
  });
  it('distância ao segmento: lateral e além da ponta', () => {
    const a = { lat: LAT, lng: -38.5 };
    const b = { lat: LAT, lng: -38.49 };
    expect(
      distanceToSegmentM({ lat: LAT - 0.0005, lng: -38.495 }, a, b),
    ).toBeCloseTo(55.6, 0);
    expect(distanceToSegmentM({ lat: LAT, lng: -38.51 }, a, b)).toBeCloseTo(
      distanceM({ lat: LAT, lng: -38.51 }, a),
      0,
    );
  });
  it('distância à geometria é 0 dentro de um contorno fechado', () => {
    const area: Geometry = {
      ids: ['way/2'],
      lines: [
        {
          closed: true,
          pts: [
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.01 },
            { lat: 0.01, lng: 0.01 },
            { lat: 0.01, lng: 0 },
            { lat: 0, lng: 0 },
          ],
        },
      ],
    };
    expect(distanceToGeometryM({ lat: 0.005, lng: 0.005 }, area)).toBe(0);
    expect(
      distanceToGeometryM({ lat: 0.005, lng: 0.02 }, area),
    ).toBeGreaterThan(1000);
  });
  it('polígono com buraco', () => {
    const b: Boundary = {
      outer: boundary.outer,
      inner: [
        [
          { lat: -12.96, lng: -38.5 },
          { lat: -12.96, lng: -38.49 },
          { lat: -12.95, lng: -38.49 },
          { lat: -12.95, lng: -38.5 },
          { lat: -12.96, lng: -38.5 },
        ],
      ],
    };
    expect(inBoundary({ lat: -12.955, lng: -38.495 }, b)).toBe(false);
    expect(inBoundary({ lat: -12.92, lng: -38.5 }, b)).toBe(true);
    expect(inBoundary({ lat: 0, lng: 0 }, b)).toBe(false);
  });
  it('monta anel a partir de trechos fora de ordem e invertidos', () => {
    const p = (lat: number, lng: number) => ({ lat, lng });
    const rings = assembleRings([
      [p(1, 1), p(1, 0)],
      [p(0, 0), p(0, 1)],
      [p(1, 1), p(0, 1)],
      [p(1, 0), p(0, 0)],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]![0]).toEqual(rings[0]![rings[0]!.length - 1]);
  });
  it('trecho que não fecha é descartado', () => {
    const p = (lat: number, lng: number) => ({ lat, lng });
    expect(assembleRings([[p(0, 0), p(0, 1)]])).toEqual([]);
  });
  it('linha central de um contorno fechado comprido segue o eixo maior', () => {
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 0.0001, lng: 0.01 },
      { lat: 0, lng: 0.02 },
      { lat: -0.0001, lng: 0.01 },
      { lat: 0, lng: 0 },
    ];
    const spine = spineOf({ ids: [], lines: [{ closed: true, pts }] })!;
    expect(lengthM(spine)).toBeGreaterThan(2000);
  });
});

describe('computeChecks', () => {
  const at = (dLat: number, lng = -38.495) => ({ lat: LAT + dLat, lng });
  it('passa dentro de Salvador, perto da praia e afastado dos outros', () => {
    const c = computeChecks(at(0.0002), [at(0, -38.4935)], beachLine, boundary);
    expect(c.inSalvador.status).toBe('pass');
    expect(c.nearBeach.status).toBe('pass');
    expect(c.minSpacing.status).toBe('pass');
  });
  it('falha fora do polígono de Salvador', () => {
    const c = computeChecks({ lat: -12.5, lng: -38.5 }, [], null, boundary);
    expect(c.inSalvador.status).toBe('fail');
  });
  it(`falha a mais de ${MAX_DISTANCE_TO_BEACH_M} m da geometria (e passa um pouco antes)`, () => {
    expect(
      computeChecks(at(0.00073), [], beachLine, boundary).nearBeach.status,
    ).toBe('fail');
    expect(
      computeChecks(at(0.0007), [], beachLine, boundary).nearBeach.status,
    ).toBe('pass');
  });
  it(`falha a menos de ${MIN_SPACING_M} m de outro ponto da praia`, () => {
    const c = computeChecks(
      at(0, -38.495),
      [at(0, -38.4952)],
      beachLine,
      boundary,
    );
    expect(c.minSpacing.status).toBe('fail');
  });
  it('sem geometria a verificação da praia é n/a; praia de um ponto só, o espaçamento é n/a', () => {
    const c = computeChecks(at(0), [], null, boundary);
    expect(c.nearBeach.status).toBe('n/a');
    expect(c.minSpacing.status).toBe('n/a');
  });
});

describe('shownInProduction, accuracyOf e pointState', () => {
  const auto = (
    level: 'g' | 'a' | 'b' | 'c' | 'd' | 'e',
    over: Partial<CatalogPoint> = {},
  ) =>
    point('A', {
      lat: LAT,
      lng: -38.5,
      source: {
        provider: 'auto',
        method: 'auto-placed',
        level,
        basis: 'geometry-spread',
        confidence: 'low',
        reason: 'teste',
        query: null,
        geometry: [],
        osm: null,
        placedAt: DAY,
      },
      ...over,
    });
  it('verificado com posição aparece e não avisa aproximação', () => {
    const p = point('A', { lat: LAT, lng: -38.5, verified: true });
    expect(shownInProduction(p)).toBe(true);
    expect(accuracyOf(p)).toBeNull();
    expect(pointState(p)).toBe('verified');
  });
  it('todo ponto automático com posição aparece, em qualquer nível, sem exceção', () => {
    for (const level of ['g', 'a', 'b', 'c', 'd', 'e'] as const) {
      expect(shownInProduction(auto(level))).toBe(true);
    }
  });
  it('níveis g, a, b: "aproximada"; níveis c, d, e: "muito aproximada"', () => {
    for (const level of ['g', 'a', 'b'] as const) {
      expect(accuracyOf(auto(level))).toBe('approximate');
      expect(pointState(auto(level))).toBe('auto');
    }
    for (const level of ['c', 'd', 'e'] as const) {
      expect(accuracyOf(auto(level))).toBe('very-approximate');
      expect(pointState(auto(level))).toBe('very-approximate');
    }
  });
  it('automático sem o campo level (dado antigo) conta como g', () => {
    const p = auto('g');
    delete (p.source as { level?: string }).level;
    expect(accuracyOf(p)).toBe('approximate');
  });
  it('sem posição nunca aparece; proposta de outra origem não aprovada não aparece', () => {
    const osm: OsmSource = {
      provider: 'osm',
      method: 'name',
      confidence: 'high',
      query: 'q',
      osmType: 'way',
      osmId: 1,
      displayName: 'x',
      fetchedAt: DAY,
    };
    expect(shownInProduction(point('A'))).toBe(false);
    expect(pointState(point('A'))).toBe('unplaced');
    const p = point('A', { lat: LAT, lng: -38.5, source: osm });
    expect(shownInProduction(p)).toBe(false);
    expect(pointState(p)).toBe('pending');
  });
});

describe('geometryForBeach', () => {
  const way = (id: number, name: string, lng: number): GeomElement => ({
    type: 'way',
    id,
    tags: { name },
    geometry: [
      { lat: LAT, lon: lng },
      { lat: LAT, lon: lng + 0.001 },
    ],
  });
  it('junta os elementos cujo nome combina e ignora os outros', () => {
    const g = geometryForBeach('Praia do Forte', [
      way(1, 'Praia do Forte', -38.5),
      way(2, 'Praia do Forte Norte', -38.49),
      way(3, 'Praia da Barra', -38.4),
    ])!;
    expect(g.ids).toEqual(['way/1', 'way/2']);
    expect(g.lines).toHaveLength(2);
  });
  it('sem elemento que combine, null', () => {
    expect(
      geometryForBeach('Praia X', [way(3, 'Praia da Barra', -38.4)]),
    ).toBeNull();
  });
});

describe('planBeach com geometria', () => {
  it('pista da descrição a até 80 m da geometria é aceita (confiança média)', () => {
    const plans = planBeach(
      input([point('P1')], {
        locations: { P1: 'Em frente à Barraca Sol Nascente, na orla.' },
        clueResults: {
          P1: [clue('Barraca Sol Nascente', LAT - 0.0005, -38.495)],
        },
      }),
    );
    expect(plans[0]).toMatchObject({
      kind: 'placed',
      source: {
        basis: 'geometry-description',
        confidence: 'medium',
        method: 'auto-placed',
      },
      checks: { nearBeach: { status: 'pass' } },
    });
    // vai para a areia: o ponto mais próximo da geometria, não a rua citada (55 m ao lado)
    const p = plans[0]!;
    if (p.kind === 'placed') expect(p.lat).toBeCloseTo(LAT, 6);
  });
  it('pista a mais de 80 m da geometria é recusada e o ponto é distribuído na geometria', () => {
    const plans = planBeach(
      input([point('P1')], {
        locations: { P1: 'Em frente à Barraca Sol Nascente, na orla.' },
        clueResults: {
          P1: [clue('Barraca Sol Nascente', LAT - 0.002, -38.495)],
        },
      }),
    );
    expect(plans[0]).toMatchObject({
      kind: 'placed',
      source: { basis: 'geometry-spread', confidence: 'low' },
    });
  });
  it('sem pista, distribui os pontos ao longo da praia com pelo menos o espaçamento mínimo', () => {
    const plans = planBeach(input([point('P1'), point('P2'), point('P3')]));
    const placed = plans.filter((p) => p.kind === 'placed');
    expect(placed).toHaveLength(3);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        if (a.kind !== 'placed' || b.kind !== 'placed') continue;
        expect(distanceM(a, b)).toBeGreaterThanOrEqual(MIN_SPACING_M);
      }
      const p = placed[i]!;
      if (p.kind === 'placed') {
        expect(p.checks.minSpacing.status).toBe('pass'); // inclusive o primeiro ponto (segunda passada)
        expect(p.checks.nearBeach.status).toBe('pass');
      }
    }
  });
  it('uma pista que cai a menos de 40 m de outro ponto da praia perde para a distribuição', () => {
    const plans = planBeach(
      input([point('P1'), point('P2')], {
        locations: {
          P1: 'Em frente à Barraca Sol, na orla.',
          P2: 'Ao lado da Barraca Lua, na orla.',
        },
        clueResults: {
          P1: [clue('Barraca Sol', LAT, -38.495)],
          P2: [clue('Barraca Lua', LAT, -38.4951)],
        },
      }),
    );
    expect(plans[0]).toMatchObject({
      source: { basis: 'geometry-description' },
    });
    expect(plans[1]).toMatchObject({
      kind: 'placed',
      source: { basis: 'geometry-spread' },
    });
  });
  it('geometria curta demais para o espaçamento: os que não cabem ficam sem posição, com motivo', () => {
    const short: Geometry = {
      ids: ['way/9'],
      lines: [
        {
          closed: false,
          pts: [
            { lat: LAT, lng: -38.5 },
            { lat: LAT, lng: -38.4997 },
          ],
        },
      ],
    }; // ≈ 33 m
    const plans = planBeach(
      input([point('P1'), point('P2')], { geometry: short }),
    );
    expect(plans.filter((p) => p.kind === 'placed')).toHaveLength(1);
    const lost = plans.find((p) => p.kind === 'unplaced');
    expect(lost).toMatchObject({ note: expect.stringContaining('sem espaço') });
  });
  it('ponto verificado e ponto manual são ignorados e contam como vizinhos', () => {
    const verified = point('V', { lat: LAT, lng: -38.495, verified: true });
    const manual = point('M', {
      lat: LAT,
      lng: -38.4948,
      source: { provider: 'manual', method: 'manual', editedAt: DAY },
    });
    const plans = planBeach(input([verified, manual, point('P1')]));
    expect(plans[0]).toEqual({ kind: 'skip', code: 'V' });
    expect(plans[1]).toEqual({ kind: 'skip', code: 'M' });
    const p = plans[2]!;
    expect(p.kind).toBe('placed');
    if (p.kind === 'placed') {
      expect(distanceM(p, { lat: LAT, lng: -38.495 })).toBeGreaterThanOrEqual(
        MIN_SPACING_M,
      );
    }
  });
  it('polígono de Salvador: geometria fora dele não gera posição', () => {
    const outside: Boundary = {
      outer: [
        [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 1 },
          { lat: 1, lng: 1 },
          { lat: 0, lng: 0 },
        ],
      ],
      inner: [],
    };
    const plans = planBeach(input([point('P1')], { boundary: outside }));
    expect(plans[0]!.kind).toBe('unplaced');
  });
});

describe('planBeach sem geometria no OSM (nível g não se aplica)', () => {
  it('deixa os pontos sem posição aqui, com o motivo do nível g, para os níveis a–e', () => {
    const plans = planBeach(
      input([point('P1')], {
        geometry: null,
        locations: { P1: 'Em frente à Barraca Sol Nascente, na orla.' },
        clueResults: {
          P1: [clue('Barraca Sol Nascente', LAT, -38.495)],
        },
      }),
    );
    expect(plans[0]).toMatchObject({
      kind: 'unplaced',
      note: expect.stringContaining('nível g'),
    });
  });
  it('geometria fora do polígono de Salvador (caso Penha): o motivo é esse, não "sem espaço"', () => {
    const outside: Boundary = {
      outer: [
        [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 1 },
          { lat: 1, lng: 1 },
          { lat: 0, lng: 0 },
        ],
      ],
      inner: [],
    };
    const plans = planBeach(input([point('P1')], { boundary: outside }));
    expect(plans[0]).toMatchObject({
      kind: 'unplaced',
      note: expect.stringContaining('fora do polígono de Salvador'),
    });
  });
  it('geometria curta demais continua dizendo "sem espaço"', () => {
    const short: Geometry = {
      ids: ['way/9'],
      lines: [
        {
          closed: false,
          pts: [
            { lat: LAT, lng: -38.5 },
            { lat: LAT, lng: -38.4997 },
          ],
        },
      ],
    };
    const plans = planBeach(
      input([point('P1'), point('P2')], { geometry: short }),
    );
    expect(plans.find((p) => p.kind === 'unplaced')).toMatchObject({
      note: expect.stringContaining('sem espaço'),
    });
  });
});

describe('geometryForBeach com o polígono de Salvador', () => {
  const way = (id: number, lng: number): GeomElement => ({
    type: 'way',
    id,
    tags: { name: 'Praia da Penha' },
    geometry: [
      { lat: LAT, lon: lng },
      { lat: LAT, lon: lng + 0.001 },
    ],
  });
  it('ignora o homônimo fora de Salvador e fica com o de dentro', () => {
    const inside = way(1, -38.5); // dentro de `boundary`
    const outside = way(2, -38.9); // fora (a oeste do polígono)
    const g = geometryForBeach('Penha', [inside, outside], undefined, boundary);
    expect(g?.ids).toEqual(['way/1']);
  });
  it('só com homônimo fora de Salvador, não há geometria (caso Penha)', () => {
    expect(
      geometryForBeach('Penha', [way(2, -38.9)], undefined, boundary),
    ).toBeNull();
  });
  it('sem polígono informado, não filtra (comportamento anterior)', () => {
    expect(geometryForBeach('Penha', [way(2, -38.9)])?.ids).toEqual(['way/2']);
  });
});

describe('applyPlans e validateForWrite (modo auto)', () => {
  const osm: OsmSource = {
    provider: 'osm',
    method: 'name',
    confidence: 'high',
    query: 'q',
    osmType: 'way',
    osmId: 1,
    displayName: 'x',
    fetchedAt: DAY,
  };
  const catalog = (points: CatalogPoint[]): Catalog => ({
    schemaVersion: 4,
    region: 'salvador',
    beaches: [entry(points)],
  });
  const run = (points: CatalogPoint[]) => {
    const prev = catalog(points);
    const plans = new Map([['Praia Teste', planBeach(input(points))]]);
    return { prev, next: applyPlans(prev, plans) };
  };
  it('guarda a proposta do OSM substituída e grava source auto-placed, checks e verified false', () => {
    const { prev, next } = run([
      point('P1', { lat: LAT, lng: -38.5, source: osm }),
    ]);
    const p = next.beaches[0]!.points[0]!;
    expect(p.source).toMatchObject({ method: 'auto-placed' });
    expect(p.proposals).toEqual([osm]);
    expect(p.checks).toBeTruthy();
    expect(p.verified).toBe(false);
    expect(validateForWrite(prev, next, 'auto')).toEqual([]);
  });
  it('ponto que falha fica sem posição, com checks nulos e nota, e a posição antiga fica no histórico', () => {
    const prev = catalog([point('P1', { lat: LAT, lng: -38.5, source: osm })]);
    const plans = new Map([
      [
        'Praia Teste',
        planBeach(
          input(prev.beaches[0]!.points, {
            boundary: { outer: [], inner: [] },
          }),
        ),
      ],
    ]);
    const p = applyPlans(prev, plans).beaches[0]!.points[0]!;
    expect(p).toMatchObject({
      lat: null,
      lng: null,
      source: null,
      placementNote: expect.any(String),
    });
    expect(p.proposals).toEqual([osm]);
  });
  it('nunca altera ponto verificado nem manual (planos e validação)', () => {
    const verified = point('V', { lat: LAT, lng: -38.495, verified: true });
    const manual = point('M', {
      lat: LAT,
      lng: -38.4,
      source: { provider: 'manual', method: 'manual', editedAt: DAY },
    });
    const { prev, next } = run([verified, manual, point('P1')]);
    expect(next.beaches[0]!.points[0]).toEqual(verified);
    expect(next.beaches[0]!.points[1]).toEqual(manual);
    expect(validateForWrite(prev, next, 'auto')).toEqual([]);
    const tampered = structuredClone(next);
    tampered.beaches[0]!.points[0]!.lat = LAT + 0.001;
    tampered.beaches[0]!.points[1]!.verified = true;
    const errors = validateForWrite(prev, tampered, 'auto').join('\n');
    expect(errors).toContain('V');
    expect(errors).toContain('não pode ser alterado');
  });
  it('o automático não aprova e não grava posição sem checks', () => {
    const { prev, next } = run([point('P1')]);
    const bad = structuredClone(next);
    bad.beaches[0]!.points[0]!.verified = true;
    delete bad.beaches[0]!.points[0]!.checks;
    const errors = validateForWrite(prev, bad, 'auto').join('\n');
    expect(errors).toContain('não aprova');
    expect(errors).toContain('sem checks');
  });
  it('no modo da página de revisão, mudança de posição com source auto-placed continua recusada', () => {
    const { prev, next } = run([point('P1')]);
    expect(validateForWrite(prev, next).join('\n')).toContain(
      'sem source manual',
    );
  });
});

describe('boundaryFromRelation', () => {
  it('monta o polígono a partir dos membros outer e inner', () => {
    const sq = (a: number, b: number) => [
      { lat: a, lon: a },
      { lat: a, lon: b },
      { lat: b, lon: b },
      { lat: b, lon: a },
    ];
    const outer = sq(0, 10);
    const inner = sq(4, 6);
    const el: GeomElement = {
      type: 'relation',
      id: 1,
      members: [
        { type: 'way', role: 'outer', geometry: [...outer.slice(0, 2)] },
        {
          type: 'way',
          role: 'outer',
          geometry: [...outer.slice(1), outer[0]!],
        },
        { type: 'way', role: 'inner', geometry: [...inner, inner[0]!] },
      ],
    };
    const b = boundaryFromRelation(el);
    expect(b.outer).toHaveLength(1);
    expect(b.inner).toHaveLength(1);
    expect(inBoundary({ lat: 2, lng: 2 }, b)).toBe(true);
    expect(inBoundary({ lat: 5, lng: 5 }, b)).toBe(false);
  });
});
