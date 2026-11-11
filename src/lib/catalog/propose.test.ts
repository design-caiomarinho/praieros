import { describe, expect, it } from 'vitest';
import {
  decideCandidate,
  neighborhoodOf,
  queriesFor,
  type NominatimResult,
} from './propose.ts';

const beach = (over: Partial<NominatimResult> = {}): NominatimResult => ({
  osm_type: 'way',
  osm_id: 1,
  lat: '-12.99',
  lon: '-38.52',
  display_name: 'Praia X, Salvador',
  category: 'natural',
  type: 'beach',
  address: { suburb: 'Barra' },
  ...over,
});
const decide = (r: NominatimResult[]) => decideCandidate(r, 'q', '2026-11-11');

describe('decideCandidate', () => {
  it('aceita um único candidato: praia, dentro de Salvador', () => {
    const d = decide([beach()]);
    expect(d).toMatchObject({
      ok: true,
      lat: -12.99,
      lng: -38.52,
      neighborhood: 'Barra',
    });
    if (d.ok)
      expect(d.source).toMatchObject({
        provider: 'osm',
        osmId: 1,
        fetchedAt: '2026-11-11',
      });
  });

  it('descarta: não encontrada', () => {
    expect(decide([])).toEqual({ ok: false, reason: 'não encontrada' });
  });

  it('descarta: resultado que não é praia', () => {
    expect(
      decide([beach({ category: 'place', type: 'suburb' })]),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining('não traz uma praia'),
    });
  });

  it('descarta: posição fora de Salvador', () => {
    expect(decide([beach({ lat: '-23.5', lon: '-46.6' })])).toEqual({
      ok: false,
      reason: 'posição fora de Salvador',
    });
  });

  it('descarta: mais de uma candidata dentro de Salvador', () => {
    expect(decide([beach(), beach({ osm_id: 2 })])).toEqual({
      ok: false,
      reason: 'mais de uma candidata (2)',
    });
  });

  it('uma candidata dentro e outra fora: aceita a de dentro', () => {
    const d = decide([
      beach({ lat: '-23.5', lon: '-46.6', osm_id: 9 }),
      beach(),
    ]);
    expect(d).toMatchObject({ ok: true });
  });

  it('bairro ausente vira null, sem inventar', () => {
    expect(neighborhoodOf(beach({ address: {} }))).toBeNull();
    expect(neighborhoodOf(beach({ address: undefined }))).toBeNull();
  });
});

describe('queriesFor', () => {
  it('tenta o nome puro e depois "Praia de"', () => {
    expect(queriesFor('Tubarão')).toEqual([
      'Tubarão, Salvador, Bahia',
      'Praia de Tubarão, Salvador, Bahia',
    ]);
  });
});
