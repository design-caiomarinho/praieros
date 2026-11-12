import { describe, expect, it } from 'vitest';
import {
  improperSummary,
  queryTokens,
  searchBeaches,
  suggestNeighborhoods,
} from './search.ts';

const beach = (name: string, neighborhood: string | null = null) => ({
  slug: name,
  name,
  neighborhood,
});

describe('queryTokens', () => {
  it('ignora acento, caixa e palavras vazias', () => {
    expect(queryTokens('  Praia DO Itapuã ')).toEqual(['itapua']);
    expect(queryTokens('Praia da Paciência de')).toEqual(['paciencia']);
  });
  it('só palavras ignoradas: usa elas mesmas', () => {
    expect(queryTokens('praia')).toEqual(['praia']);
  });
  it('vazio', () => {
    expect(queryTokens('   ')).toEqual([]);
  });
});

describe('searchBeaches', () => {
  const items = [
    beach('Farol da Barra', 'Barra'),
    beach('Praia do Forte', 'Praia do Forte'),
    beach('Barra', 'Barra'),
    beach('Porto da Barra', 'Barra'),
    beach('Itapuã', 'Itapuã'),
    beach('Jardim de Alah', 'Pituba'),
  ];

  it('texto vazio não devolve nada', () => {
    expect(searchBeaches(items, '')).toEqual([]);
  });
  it('acha sem acento e sem diferenciar maiúsculas', () => {
    expect(searchBeaches(items, 'ITAPUA').map((b) => b.name)).toEqual([
      'Itapuã',
    ]);
  });
  it('ignora "praia", "de", "do" e "da" na busca e no nome', () => {
    expect(searchBeaches(items, 'praia do forte').map((b) => b.name)).toEqual([
      'Praia do Forte',
    ]);
    expect(searchBeaches(items, 'forte').map((b) => b.name)).toEqual([
      'Praia do Forte',
    ]);
    expect(searchBeaches(items, 'jardim alah').map((b) => b.name)).toEqual([
      'Jardim de Alah',
    ]);
  });
  it('ordena: começa com o texto, depois palavra, contém, bairro; empate alfabético', () => {
    const r = searchBeaches(
      [...items, beach('Ponta da Barrinha', 'Pituba')],
      'barr',
    ).map((b) => b.name);
    expect(r).toEqual([
      'Barra',
      'Farol da Barra',
      'Ponta da Barrinha',
      'Porto da Barra',
    ]);
  });
  it('encontra pelo bairro quando o nome não combina', () => {
    expect(searchBeaches(items, 'pituba').map((b) => b.name)).toEqual([
      'Jardim de Alah',
    ]);
  });
  it('praia sem bairro e termo sem resultado', () => {
    expect(searchBeaches([beach('Armação')], 'xyz')).toEqual([]);
    expect(searchBeaches([beach('Armação')], 'armacao')).toHaveLength(1);
  });
});

describe('suggestNeighborhoods', () => {
  it('sem repetir, em ordem alfabética, só com bairro', () => {
    expect(
      suggestNeighborhoods([
        { neighborhood: 'Pituba' },
        { neighborhood: null },
        { neighborhood: 'Barra' },
        { neighborhood: 'pituba' },
        { neighborhood: 'Itapuã' },
      ]),
    ).toEqual(['Barra', 'Itapuã', 'Pituba']);
  });
  it('nenhum bairro: lista vazia', () => {
    expect(suggestNeighborhoods([{ neighborhood: null }])).toEqual([]);
  });
});

describe('improperSummary (D1)', () => {
  it('2+ pontos com impróprio', () => {
    expect(improperSummary({ shownPoints: 3, improperPoints: 1 })).toBe(
      '1 de 3 pontos impróprios',
    );
  });
  it('1 ponto, nenhum impróprio ou sem ponto: sem contagem', () => {
    expect(improperSummary({ shownPoints: 1, improperPoints: 1 })).toBeNull();
    expect(improperSummary({ shownPoints: 3, improperPoints: 0 })).toBeNull();
    expect(improperSummary({ shownPoints: 0, improperPoints: 0 })).toBeNull();
  });
});
