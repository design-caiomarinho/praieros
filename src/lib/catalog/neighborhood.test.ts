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
