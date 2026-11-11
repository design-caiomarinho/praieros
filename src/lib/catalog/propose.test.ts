import { describe, expect, it } from 'vitest';
import {
  decideCandidate,
  decideDescription,
  descriptionQuery,
  matchOverpass,
  namesMatch,
  neighborhoodOf,
  overpassQuery,
  queriesFor,
  resolveBeach,
  descriptionClause,
  type NominatimResult,
  type OverpassElement,
  type ProposalDeps,
} from './propose.ts';

const beach = (over: Partial<NominatimResult> = {}): NominatimResult => ({
  osm_type: 'way',
  osm_id: 1,
  lat: '-12.99',
  lon: '-38.52',
  display_name: 'Praia X, Salvador',
  name: 'Praia X',
  category: 'natural',
  type: 'beach',
  address: { suburb: 'Barra' },
  ...over,
});
const decide = (r: NominatimResult[]) =>
  decideCandidate(r, 'q', '2026-11-11', 'X');

describe('decideCandidate', () => {
  it('aceita um único candidato: praia, dentro de Salvador', () => {
    const d = decide([beach()]);
    expect(d).toMatchObject({
      ok: true,
      lat: -12.99,
      lng: -38.52,
      neighborhood: 'Barra',
    });
    if (d.ok) {
      expect(d.source).toMatchObject({
        provider: 'osm',
        method: 'name',
        confidence: 'high',
        osmId: 1,
        fetchedAt: '2026-11-11',
      });
    }
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

  it('descarta: praia com outro nome (ex.: Pedra do Sal para Farol de Itapuã)', () => {
    const d = decideCandidate(
      [beach({ name: 'Praia de Pedra do Sal' })],
      'q',
      'd',
      'Farol de Itapuã',
    );
    expect(d).toEqual({ ok: false, reason: 'a praia achada tem outro nome' });
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
  it('nome puro e variações com Praia do/da/de, sempre em Salvador', () => {
    expect(queriesFor('Tubarão')).toEqual([
      'Tubarão, Salvador, Bahia',
      'Praia do Tubarão, Salvador, Bahia',
      'Praia da Tubarão, Salvador, Bahia',
      'Praia de Tubarão, Salvador, Bahia',
    ]);
  });

  it('nome que já começa com Praia: acrescenta o nome sem o prefixo, sem repetir', () => {
    const q = queriesFor('Praia do Forte');
    expect(q[0]).toBe('Praia do Forte, Salvador, Bahia');
    expect(q).toContain('Forte, Salvador, Bahia');
    expect(new Set(q).size).toBe(q.length);
  });
});

describe('namesMatch', () => {
  it('ignora caixa, acento, artigos e o prefixo Praia', () => {
    expect(namesMatch('Lagoa de Abaeté', 'Lagoa do Abaete')).toBe(true);
    expect(namesMatch('Porto da Barra', 'Praia do Porto da Barra')).toBe(true);
  });

  it('um nome contido no outro como palavras inteiras', () => {
    expect(namesMatch('Pituaçu', 'Praia de Pituaçu Norte')).toBe(true);
    expect(namesMatch('Roma', 'Romana')).toBe(false);
    // o OSM mais curto que o boletim não vale: Praia da Barra não é o Farol da Barra
    expect(namesMatch('Farol da Barra', 'Praia da Barra')).toBe(false);
  });
});

const el = (
  name: string,
  tags: Record<string, string>,
  at: { lat: number; lon: number } = { lat: -12.98, lon: -38.5 },
  id = 1,
): OverpassElement => ({
  type: 'way',
  id,
  center: at,
  tags: { name, ...tags },
});

describe('overpassQuery', () => {
  it('inclui praias, corpos d’água e marinas, com nome', () => {
    const q = overpassQuery();
    expect(q).toContain('"natural"="beach"');
    expect(q).toContain('"natural"="water"');
    expect(q).toContain('"leisure"="marina"');
    expect(q).toContain('out center tags');
  });
});

describe('matchOverpass', () => {
  const day = '2026-11-12';

  it('aceita exatamente um candidato coerente (confiança média)', () => {
    const d = matchOverpass(
      [
        el('Porto da Barra', { natural: 'beach' }),
        el('Outra', { natural: 'beach' }, undefined, 2),
      ],
      'Porto da Barra',
      day,
    );
    expect(d).toMatchObject({
      ok: true,
      lat: -12.98,
      lng: -38.5,
      neighborhood: null,
    });
    if (d.ok) {
      expect(d.source).toMatchObject({
        method: 'overpass',
        confidence: 'medium',
      });
    }
  });

  it('aceita lagoa e marina, que o boletim lista', () => {
    const lagoa = [el('Lagoa de Pituaçu', { natural: 'water' })];
    const marina = [el('Marina Contorno', { leisure: 'marina' })];
    expect(matchOverpass(lagoa, 'Lagoa de Pituaçu', day).ok).toBe(true);
    expect(matchOverpass(marina, 'Marina Contorno', day).ok).toBe(true);
  });

  it('nenhuma correspondência', () => {
    expect(matchOverpass([el('X', { natural: 'beach' })], 'Y', day)).toEqual({
      ok: false,
      reason: 'nenhuma correspondência de nome',
    });
  });

  it('mais de uma candidata: descarta, não escolhe', () => {
    const d = matchOverpass(
      [
        el('Itapuã', { natural: 'beach' }),
        el('Praia de Itapuã', { natural: 'beach' }, undefined, 2),
      ],
      'Itapuã',
      day,
    );
    expect(d).toEqual({ ok: false, reason: 'mais de uma candidata (2)' });
  });

  it('fora de Salvador: descarta', () => {
    const d = matchOverpass(
      [el('Itapuã', { natural: 'beach' }, { lat: -23.5, lon: -46.6 })],
      'Itapuã',
      day,
    );
    expect(d).toEqual({ ok: false, reason: 'posição fora de Salvador' });
  });
});

describe('descriptionQuery', () => {
  it('tira a abertura e corta na primeira vírgula', () => {
    expect(
      descriptionQuery('Em frente à casa Vila Maria, ao lado da rampa.'),
    ).toBe('casa Vila Maria, Salvador, Bahia');
    expect(descriptionQuery('Ao lado do Forte de São Diogo.')).toBe(
      'Forte de São Diogo, Salvador, Bahia',
    );
  });

  it('null quando não sobra descrição aproveitável', () => {
    expect(descriptionQuery(null)).toBeNull();
    expect(descriptionQuery('Em frente a.')).toBeNull();
    // genérica: sem nome próprio
    expect(descriptionClause('Em frente à quadra de esportes.')).toBeNull();
    // abreviação com ponto não corta a frase
    expect(descriptionClause('Na Av. Simón Bolívar, em frente.')).toBe(
      'Na Av. Simón Bolívar',
    );
  });
});

describe('decideDescription', () => {
  const r = (over: Partial<NominatimResult> = {}): NominatimResult => ({
    osm_type: 'node',
    osm_id: 5,
    lat: '-12.9',
    lon: '-38.4',
    display_name: 'Rua X, Salvador',
    ...over,
  });

  it('aceita um resultado dentro de Salvador, com baixa confiança', () => {
    const d = decideDescription([r()], 'q', '2026-11-12', 'Rua X');
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.source).toMatchObject({
        method: 'description',
        confidence: 'low',
      });
    }
  });

  it('descarta resultado cujo nome não é o citado (ex.: casa de jazz para Av. Simón Bolívar)', () => {
    expect(decideDescription([r()], 'q', 'd', 'Forte Beta')).toEqual({
      ok: false,
      reason: 'nenhum resultado com o nome citado',
    });
  });

  it('descarta nenhum, vários e fora de Salvador', () => {
    expect(decideDescription([], 'q', 'd', 'Rua X').ok).toBe(false);
    expect(
      decideDescription([r(), r({ osm_id: 6 })], 'q', 'd', 'Rua X'),
    ).toEqual({
      ok: false,
      reason: 'mais de uma candidata (2)',
    });
    expect(
      decideDescription([r({ lat: '-23', lon: '-46' })], 'q', 'd', 'Rua X'),
    ).toEqual({ ok: false, reason: 'posição fora de Salvador' });
  });
});

describe('resolveBeach (ordem das etapas)', () => {
  const points = [
    { code: 'P1', location: 'Em frente à Rua Alfa, esquina.' },
    { code: 'P2', location: 'Ao lado do Forte Beta.' },
  ];
  const calls: string[] = [];
  const mk = (over: Partial<ProposalDeps> = {}): ProposalDeps => {
    calls.length = 0;
    return {
      today: '2026-11-12',
      search: async (q) => {
        calls.push(`search:${q}`);
        return [];
      },
      overpass: async () => {
        calls.push('overpass');
        return [];
      },
      reverse: async () => {
        calls.push('reverse');
        return beach({ address: { suburb: 'Barra' } });
      },
      ...over,
    };
  };

  it('etapa 1 aceita: não chama Overpass', async () => {
    const r = await resolveBeach(
      'Roma',
      points,
      mk({ search: async () => [beach({ name: 'Praia de Roma' })] }),
    );
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.source).toMatchObject({
      method: 'name',
      confidence: 'high',
    });
    expect(r.note).toBeNull();
    expect(calls).not.toContain('overpass');
  });

  it('etapa 2 aceita: reverse dá o bairro e a etapa 3 não roda', async () => {
    const d = mk({ overpass: async () => [el('Roma', { natural: 'beach' })] });
    const r = await resolveBeach('Roma', points, d);
    expect(r.points[0]!.source).toMatchObject({ method: 'overpass' });
    expect(r.neighborhood).toBe('Barra');
    expect(calls).toContain('reverse');
    expect(calls.filter((c) => c.includes('Rua Alfa'))).toHaveLength(0);
  });

  it('etapa 3 só roda se 1 e 2 falharem; vale por ponto e é de baixa confiança', async () => {
    const d = mk({
      search: async (q) =>
        q.startsWith('Rua Alfa')
          ? [
              {
                osm_type: 'node',
                osm_id: 7,
                lat: '-12.9',
                lon: '-38.4',
                display_name: 'Rua Alfa',
                address: { suburb: 'Centro' },
              },
            ]
          : [],
    });
    const r = await resolveBeach('Roma', points, d);
    expect(r.points.map((p) => p.code)).toEqual(['P1']);
    expect(r.points[0]!.source).toMatchObject({
      method: 'description',
      confidence: 'low',
    });
    expect(r.neighborhood).toBe('Centro');
    expect(r.note).toContain('nome:');
    expect(r.note).toContain('overpass:');
    expect(r.note).toContain('descrição (P2)');
  });

  it('tudo falha: sem pontos e com o motivo de cada etapa', async () => {
    const r = await resolveBeach('Roma', points, mk());
    expect(r.points).toEqual([]);
    expect(r.note).toMatch(/^nome: .*; overpass: .*; descrição \(P1, P2\): /);
  });

  it('nenhuma proposta traz verified (o script grava sempre false)', async () => {
    const r = await resolveBeach(
      'Roma',
      points,
      mk({ search: async () => [beach({ name: 'Praia de Roma' })] }),
    );
    expect(JSON.stringify(r)).not.toContain('verified');
  });
});
