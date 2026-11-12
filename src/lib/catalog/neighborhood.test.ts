import { describe, expect, it } from 'vitest';
import {
  areasAt,
  areasFromElements,
  decideNeighborhood,
  decideReferenceNeighborhood,
  isAutoNeighborhood,
  neighborhoodPointOf,
  type NeighborhoodArea,
  type NeighborhoodPoint,
} from './neighborhood.ts';
import type { GeomElement } from './placement.ts';
import type { CatalogPoint } from './types.ts';

/** Quadrado de 0,01° a partir de (lat, lng). */
const square = (lat: number, lng: number, d = 0.01) => [
  { lat, lng },
  { lat, lng: lng + d },
  { lat: lat + d, lng: lng + d },
  { lat: lat + d, lng },
  { lat, lng },
];
const area = (osmId: number, name: string, lat: number, lng: number) =>
  ({
    osmId,
    name,
    boundary: { outer: [square(lat, lng)], inner: [] },
  }) satisfies NeighborhoodArea;

const A = area(1, 'Barra', -13.0, -38.5);
const B = area(2, 'Ondina', -13.0, -38.49);
const areas = [A, B];
const inA = { lat: -12.995, lng: -38.495 };
const inB = { lat: -12.995, lng: -38.485 };
const nowhere = { lat: -12.9, lng: -38.4 };

const pt = (label: string, p: { lat: number; lng: number }, trusted = true) =>
  ({ label, ...p, trusted }) satisfies NeighborhoodPoint;

describe('ponto-em-polígono', () => {
  it('acha o polígono que contém o ponto', () => {
    expect(areasAt(inA, areas).map((a) => a.name)).toEqual(['Barra']);
    expect(areasAt(inB, areas).map((a) => a.name)).toEqual(['Ondina']);
    expect(areasAt(nowhere, areas)).toEqual([]);
  });
  it('respeita o buraco (anel interno)', () => {
    const donut: NeighborhoodArea = {
      osmId: 9,
      name: 'Anel',
      boundary: {
        outer: [square(-13.0, -38.5)],
        inner: [square(-12.997, -38.497, 0.004)],
      },
    };
    expect(areasAt(inA, [donut])).toEqual([]);
    expect(areasAt({ lat: -12.9985, lng: -38.4985 }, [donut])).toHaveLength(1);
  });
  it('monta os polígonos a partir de relações do Overpass (só nível 10, com nome)', () => {
    const ring = square(-13.0, -38.5).map((p) => ({ lat: p.lat, lon: p.lng }));
    const rel = (tags: Record<string, string>): GeomElement => ({
      type: 'relation',
      id: 7,
      tags,
      members: [{ type: 'way', role: 'outer', geometry: ring }],
    });
    const out = areasFromElements([
      rel({ name: 'Barra', admin_level: '10' }),
      rel({ name: 'Salvador', admin_level: '9' }),
      rel({ admin_level: '10' }),
    ]);
    expect(out.map((a) => a.name)).toEqual(['Barra']);
    expect(areasAt(inA, out)).toHaveLength(1);
  });
});

describe('decideNeighborhood', () => {
  it('todos os pontos no mesmo bairro: confiança alta', () => {
    const d = decideNeighborhood([pt('1', inA), pt('2', inA)], [], areas);
    expect(d).toMatchObject({ ok: true, confidence: 'high' });
    expect(d.ok && d.area.name).toBe('Barra');
  });
  it('pontos em bairros diferentes: vence o mais frequente (confiança média)', () => {
    const d = decideNeighborhood(
      [pt('1', inA), pt('2', inA), pt('3', inB)],
      [],
      areas,
    );
    expect(d).toMatchObject({ ok: true, confidence: 'medium' });
    expect(d.ok && d.area.name).toBe('Barra');
  });
  it('empate: não preenche e diz o motivo', () => {
    const d = decideNeighborhood([pt('1', inA), pt('2', inB)], [], areas);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toContain('empate entre Barra e Ondina');
  });
  it('só níveis c, d ou e: não preenche e lista os pontos ignorados', () => {
    const d = decideNeighborhood(
      [],
      [
        { label: 'SSA 1', skipped: 'nível c' },
        { label: 'SSA 2', skipped: 'nível e' },
      ],
      areas,
    );
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toContain('nenhum ponto de nível g, a ou b');
    expect(!d.ok && d.reason).toContain('SSA 1: nível c');
  });
  it('ponto de alta confiança fora de qualquer polígono: sem voto', () => {
    const d = decideNeighborhood([pt('1', nowhere)], [], areas);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toContain('cai em um polígono de bairro');
  });
  it('ponto ignorado junto de ponto bom: preenche com confiança média', () => {
    const d = decideNeighborhood(
      [pt('1', inA)],
      [{ label: '2', skipped: 'nível d' }],
      areas,
    );
    expect(d).toMatchObject({ ok: true, confidence: 'medium' });
    expect(d.ok && d.reason).toContain('1 ponto ignorado');
  });
});

describe('neighborhoodPointOf (quais pontos valem)', () => {
  const base: CatalogPoint = {
    code: 'SSA 1',
    lat: -13.0,
    lng: -38.5,
    source: null,
    proposals: [],
    verified: false,
  };
  const auto = (level?: 'g' | 'a' | 'b' | 'c' | 'd' | 'e'): CatalogPoint => ({
    ...base,
    source: {
      provider: 'auto',
      method: 'auto-placed',
      level,
      basis: 'beach-name',
      confidence: 'low',
      reason: '',
      query: null,
      geometry: [],
      osm: null,
      placedAt: '2026-11-12',
    },
  });
  it('níveis g, a, b e sem nível valem; c, d, e não', () => {
    for (const l of [undefined, 'g', 'a', 'b'] as const)
      expect(neighborhoodPointOf(auto(l))).toMatchObject({ trusted: true });
    for (const l of ['c', 'd', 'e'] as const)
      expect(neighborhoodPointOf(auto(l))).toMatchObject({
        skipped: `nível ${l}`,
      });
  });
  it('posição manual vale; sem posição e proposta solta do OSM não', () => {
    expect(
      neighborhoodPointOf({
        ...base,
        source: {
          provider: 'manual',
          method: 'manual',
          editedAt: '2026-11-12',
        },
      }),
    ).toMatchObject({ trusted: true });
    expect(
      neighborhoodPointOf({ ...base, lat: null, lng: null }),
    ).toMatchObject({ skipped: 'sem posição' });
    expect(
      neighborhoodPointOf({
        ...base,
        source: {
          provider: 'osm',
          method: 'name',
          confidence: 'high',
          query: '',
          osmType: 'way',
          osmId: 1,
          displayName: '',
          fetchedAt: '2026-11-12',
        },
      }),
    ).toMatchObject({ skipped: 'posição só proposta pelo OSM' });
  });
});

describe('praia de referência', () => {
  it('usa a posição da geometria da praia', () => {
    const d = decideReferenceNeighborhood(inB, areas);
    expect(d.ok && d.area.name).toBe('Ondina');
    expect(decideReferenceNeighborhood(nowhere, areas).ok).toBe(false);
  });
});

describe('isAutoNeighborhood', () => {
  it('só o método polygon é automático liberado', () => {
    expect(isAutoNeighborhood({ method: 'polygon' })).toBe(true);
    expect(isAutoNeighborhood({ method: 'reverse' })).toBe(false);
    expect(isAutoNeighborhood(null)).toBe(false);
  });
});

describe('A: contorno com vão pequeno', () => {
  const toLon = (ps: { lat: number; lng: number }[]) =>
    ps.map((p) => ({ lat: p.lat, lon: p.lng }));
  /** Quadrado em dois trechos; `gapDeg` deixa um vão no canto final (0,0001° ~ 11 m). */
  const rel = (gapDeg: number): GeomElement => {
    const ring = square(-13.0, -38.5);
    // trecho 1: do canto 0 até o canto 3; trecho 2: do canto 3 até o fim, mas terminando
    // `gapDeg` antes de fechar no canto 0.
    const w1 = ring.slice(0, 4);
    const w2 = [ring[3]!, { lat: ring[4]!.lat - gapDeg, lng: ring[4]!.lng }];
    return {
      type: 'relation',
      id: 5,
      tags: { name: 'Com Vão', admin_level: '10' },
      members: [
        { type: 'way', role: 'outer', geometry: toLon(w1) },
        { type: 'way', role: 'outer', geometry: toLon(w2) },
      ],
    };
  };
  it('fecha vão de até 150 m e conta o fecho', () => {
    const out = areasFromElements([rel(0.0005)]); // ~55 m
    expect(out).toHaveLength(1);
    expect(out[0]!.gapsClosed).toBe(1);
    expect(areasAt({ lat: -12.995, lng: -38.495 }, out)).toHaveLength(1);
  });
  it('vão maior que 150 m: o polígono é descartado', () => {
    expect(areasFromElements([rel(0.002)])).toEqual([]); // ~220 m
  });
  it('contorno que já fecha não conta fecho', () => {
    expect(areasFromElements([rel(0)])[0]?.gapsClosed).toBeUndefined();
  });
});

describe('B: tolerância de 100 m', () => {
  const E = area(3, 'Longe', -13.0, -38.52);
  const near = { lat: -12.995, lng: -38.5005 }; // ~54 m de Barra
  it('ponto fora de todo polígono, a até 100 m do mais próximo e sem empate: usa-o', () => {
    const d = decideNeighborhood([pt('1', near)], [], [A, E]);
    expect(d).toMatchObject({ ok: true, confidence: 'medium' });
    expect(d.ok && d.area.name).toBe('Barra');
    expect(d.ok && d.reason).toContain('tolerância de 100 m');
  });
  it('mais longe que 100 m: não preenche', () => {
    const far = { lat: -12.995, lng: -38.5015 }; // ~163 m
    expect(decideNeighborhood([pt('1', far)], [], [A, E]).ok).toBe(false);
  });
  it('empate com outro polígono (segundo a menos de 100 m além do primeiro): não preenche', () => {
    const E2 = area(4, 'Vizinho', -13.0, -38.511);
    const d = decideNeighborhood([pt('1', near)], [], [A, E2]);
    expect(d.ok).toBe(false);
  });
  it('só vale quando nenhum polígono contém o ponto', () => {
    const d = decideNeighborhood([pt('1', inA)], [], [A, B]);
    expect(d).toMatchObject({ ok: true, confidence: 'high' });
  });
  it('praia de referência também usa a tolerância (confiança média)', () => {
    const d = decideReferenceNeighborhood(near, [A, E]);
    expect(d).toMatchObject({ ok: true, confidence: 'medium' });
    expect(
      decideReferenceNeighborhood({ lat: -12.995, lng: -38.5015 }, [A, E]).ok,
    ).toBe(false);
  });
});

describe('C restrita: o nome só desempata', () => {
  it('empate entre dois polígonos e um tem o nome da praia: ele vence (confiança média)', () => {
    const d = decideNeighborhood(
      [pt('1', inA), pt('2', inB)],
      [],
      areas,
      'Ondina',
    );
    expect(d).toMatchObject({ ok: true, confidence: 'medium' });
    expect(d.ok && d.area.name).toBe('Ondina');
    expect(d.ok && d.reason).toContain('desempatado pelo nome da praia');
  });
  it('empate e nenhum polígono tem o nome: continua sem bairro', () => {
    expect(
      decideNeighborhood([pt('1', inA), pt('2', inB)], [], areas, 'Outra').ok,
    ).toBe(false);
  });
  it('o nome nunca contraria a posição: sem empate, vence a posição', () => {
    const d = decideNeighborhood(
      [pt('1', inA), pt('2', inA), pt('3', inB)],
      [],
      areas,
      'Ondina',
    );
    expect(d.ok && d.area.name).toBe('Barra');
  });
  it('empate entre três polígonos: não usa o nome', () => {
    const C = area(5, 'Terceiro', -13.0, -38.48);
    const inC = { lat: -12.995, lng: -38.475 };
    expect(
      decideNeighborhood(
        [pt('1', inA), pt('2', inB), pt('3', inC)],
        [],
        [A, B, C],
        'Ondina',
      ).ok,
    ).toBe(false);
  });
});
