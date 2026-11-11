import { describe, expect, it } from 'vitest';
import type { Boundary } from './geo.ts';
import type { GeomElement } from './placement.ts';
import { pickReferenceBeaches, similarNames } from './reference.ts';

// "Salvador" sintético: quadrado de 0,1° de lado.
const boundary: Boundary = {
  outer: [
    [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.1 },
      { lat: 0.1, lng: 0.1 },
      { lat: 0.1, lng: 0 },
      { lat: 0, lng: 0 },
    ],
  ],
  inner: [],
};

const way = (
  id: number,
  name: string,
  from: [number, number],
  to: [number, number],
  natural = 'beach',
): GeomElement => ({
  type: 'way',
  id,
  tags: { name, natural },
  geometry: [
    { lat: from[0], lon: from[1] },
    { lat: to[0], lon: to[1] },
  ],
});

const run = (
  elements: GeomElement[],
  extra: Partial<Parameters<typeof pickReferenceBeaches>[0]> = {},
) =>
  pickReferenceBeaches({
    elements,
    boundary,
    known: [{ name: 'Praia da Barra', points: [{ lat: 0.05, lng: 0.05 }] }],
    today: '2026-11-11',
    ...extra,
  });

describe('pickReferenceBeaches', () => {
  it('praia do OSM que não casa com o boletim vira referência, com posição sobre a geometria', () => {
    const r = run([way(1, 'Praia Solta', [0.02, 0.02], [0.02, 0.04])]);
    expect(r.references).toHaveLength(1);
    expect(r.references[0]).toMatchObject({
      name: 'Praia Solta',
      osmType: 'way',
      osmId: 1,
      source: 'osm',
      lat: 0.02,
    });
    expect(r.references[0]!.lng).toBeGreaterThanOrEqual(0.02);
    expect(r.references[0]!.lng).toBeLessThanOrEqual(0.04);
  });

  it('casa com o boletim por nome (sem "Praia", acento ou caixa): não é referência', () => {
    const r = run([way(1, 'Barra', [0.05, 0.05], [0.05, 0.06])]);
    expect(r.references).toEqual([]);
    expect(r.matched).toEqual(['Barra']);
  });

  it('casa pela dica de nome do OSM', () => {
    const r = run([way(1, 'Stella Maris', [0.02, 0.02], [0.02, 0.03])], {
      known: [{ name: 'Stella Mares', points: [] }],
      hints: { 'Stella Mares': 'Stella Maris' },
    });
    expect(r.references).toEqual([]);
  });

  it('fora de Salvador (homônimo) não vira referência', () => {
    const r = run([way(1, 'Praia Longe', [0.5, 0.5], [0.5, 0.6])]);
    expect(r.references).toEqual([]);
    expect(r.outside).toEqual(['Praia Longe']);
  });

  it('ignora o que não é natural=beach e os nomes de reference-exclude.json', () => {
    const r = run(
      [
        way(1, 'Lagoa X', [0.02, 0.02], [0.02, 0.03], 'water'),
        way(2, 'Praia Cortada', [0.03, 0.02], [0.03, 0.03]),
      ],
      { exclude: ['praia cortada'] },
    );
    expect(r.references).toEqual([]);
    expect(r.excluded).toEqual(['Praia Cortada']);
  });

  it('junta vários trechos de mesmo nome numa só referência', () => {
    const r = run([
      way(1, 'Praia Dupla', [0.02, 0.02], [0.02, 0.03]),
      way(2, 'Praia Dupla', [0.021, 0.04], [0.021, 0.05]),
    ]);
    expect(r.references).toHaveLength(1);
  });

  it('suspeita de duplicata: a menos de 300 m de uma praia do boletim, sem descartar', () => {
    const r = run([way(1, 'Praia Colada', [0.051, 0.0501], [0.051, 0.0502])]);
    expect(r.references).toHaveLength(1);
    expect(r.suspects).toHaveLength(1);
    expect(r.suspects[0]).toMatchObject({
      reference: 'Praia Colada',
      known: 'Praia da Barra',
      reasons: ['near'],
    });
    expect(r.suspects[0]!.distanceM).toBeLessThan(300);
  });

  it('suspeita de duplicata: nome parecido, mesmo longe', () => {
    const r = run([way(1, 'Praia da Bara', [0.01, 0.01], [0.01, 0.02])]);
    expect(r.suspects[0]).toMatchObject({
      reference: 'Praia da Bara',
      reasons: ['similar-name'],
    });
  });

  it('praia longe e de nome diferente não é suspeita', () => {
    const r = run([way(1, 'Praia Solta', [0.01, 0.01], [0.01, 0.02])]);
    expect(r.suspects).toEqual([]);
  });
});

describe('similarNames', () => {
  it('contido no outro, nos dois sentidos', () => {
    expect(similarNames('Farol da Barra', 'Barra')).toBe(true);
    expect(similarNames('Barra', 'Farol da Barra')).toBe(true);
  });
  it('diferença pequena de grafia', () => {
    expect(similarNames('Armação', 'Armaçao')).toBe(true);
    expect(similarNames('Jaguaribe', 'Jaguaribi')).toBe(true);
  });
  it('nomes diferentes não são parecidos', () => {
    expect(similarNames('Itapuã', 'Piatã')).toBe(false);
    expect(similarNames('Ipitanga', 'Pituba')).toBe(false);
  });
});
