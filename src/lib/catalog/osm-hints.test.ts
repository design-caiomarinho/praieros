import { describe, expect, it } from 'vitest';
import { osmSearchName } from './osm-hints.ts';
import { geometryForBeach, type GeomElement } from './placement.ts';
import { resolveBeach, type NominatimResult } from './propose.ts';

const hints = { Placafor: 'Placaford', 'Stella Mares': 'Stella Maris' };

describe('osmSearchName', () => {
  it('troca o nome do boletim pelo do OSM quando há dica', () => {
    expect(osmSearchName('Placafor', hints)).toBe('Placaford');
    expect(osmSearchName('Stella Mares', hints)).toBe('Stella Maris');
  });
  it('compara sem caixa nem acento e ignora espaços repetidos', () => {
    expect(osmSearchName('  STELLA   mares ', hints)).toBe('Stella Maris');
  });
  it('sem dica (ou sem tabela), devolve o nome do boletim', () => {
    expect(osmSearchName('Porto da Barra', hints)).toBe('Porto da Barra');
    expect(osmSearchName('Placafor')).toBe('Placafor');
  });
  it('não encadeia: o valor de uma dica não é procurado de novo', () => {
    expect(osmSearchName('A', { A: 'B', B: 'C' })).toBe('B');
  });
});

describe('geometryForBeach com dicas', () => {
  const placaford: GeomElement = {
    type: 'way',
    id: 5,
    tags: { name: 'Praia de Placaford' },
    geometry: [
      { lat: -12.9, lon: -38.5 },
      { lat: -12.9, lon: -38.49 },
    ],
  };
  it('acha a geometria pelo nome do OSM; sem a dica não acha', () => {
    expect(geometryForBeach('Placafor', [placaford], hints)?.ids).toEqual([
      'way/5',
    ]);
    expect(geometryForBeach('Placafor', [placaford])).toBeNull();
  });
});

describe('resolveBeach com dicas', () => {
  const praia = (name: string): NominatimResult => ({
    osm_type: 'way',
    osm_id: 9,
    lat: '-12.9',
    lon: '-38.45',
    display_name: `${name}, Salvador`,
    name,
    category: 'natural',
    type: 'beach',
    address: { suburb: 'Placaford' },
  });
  const run = async (h?: typeof hints) => {
    const queries: string[] = [];
    const r = await resolveBeach(
      'Placafor',
      [{ code: 'SSA 1', location: null }],
      {
        search: async (q) => {
          queries.push(q);
          return [praia('Praia de Placaford')];
        },
        overpass: async () => [],
        reverse: async () => null,
        today: '2026-11-12',
        hints: h,
      },
    );
    return { r, queries };
  };
  it('com a dica, a busca usa o nome do OSM e a praia é aceita', async () => {
    const { r, queries } = await run(hints);
    expect(queries[0]).toContain('Placaford');
    expect(queries.some((q) => q.startsWith('Placafor,'))).toBe(false);
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.source).toMatchObject({ method: 'name' });
  });
  it('sem a dica, o nome do boletim não combina com o do OSM e nada é aceito', async () => {
    const { r } = await run();
    expect(r.points).toHaveLength(0);
  });
});
