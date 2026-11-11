import { describe, expect, it } from 'vitest';
import {
  applyAction,
  approveBeach,
  beachState,
  migrateCatalog,
  movePoint,
  parseAction,
  reverseSuggestion,
  setNeighborhood,
  validateForWrite,
} from './review.ts';
import type { Catalog, OsmSource } from './types.ts';

const osm: OsmSource = {
  provider: 'osm',
  method: 'name',
  confidence: 'high',
  query: 'Praia X',
  osmType: 'way',
  osmId: 1,
  displayName: 'Praia X',
  fetchedAt: '2026-11-11',
};

const catalog = (): Catalog => ({
  schemaVersion: 4,
  region: 'salvador',
  beaches: [
    {
      name: 'Praia A',
      neighborhood: 'Bairro A',
      neighborhoodSource: osm,
      neighborhoodProposals: [],
      neighborhoodVerified: false,
      proposalNote: null,
      points: [
        {
          code: 'SSA 1',
          lat: -12.9,
          lng: -38.4,
          source: osm,
          proposals: [],
          verified: false,
        },
        {
          code: 'SSA 2',
          lat: -12.91,
          lng: -38.41,
          source: osm,
          proposals: [],
          verified: false,
        },
      ],
    },
    {
      name: 'Praia B',
      neighborhood: null,
      neighborhoodSource: null,
      neighborhoodProposals: [],
      neighborhoodVerified: false,
      proposalNote: 'sem proposta',
      points: [
        {
          code: 'SSA 3',
          lat: null,
          lng: null,
          source: null,
          proposals: [],
          verified: false,
        },
      ],
    },
  ],
});

const DAY = '2026-11-12';
const ok = (r: ReturnType<typeof approveBeach>) => {
  if (!r.ok) throw new Error(r.error);
  return r.catalog;
};

describe('beachState', () => {
  it('sem posição quando algum ponto não tem coordenadas', () => {
    expect(beachState(catalog().beaches[1]!)).toBe('unplaced');
  });
  it('proposto quando tem posição mas não foi aprovado', () => {
    expect(beachState(catalog().beaches[0]!)).toBe('proposed');
  });
  it('verificado só com pontos e bairro aprovados', () => {
    const c = ok(approveBeach(catalog(), 'Praia A'));
    expect(beachState(c.beaches[0]!)).toBe('verified');
  });
});

describe('approveBeach', () => {
  it('aprova todos os pontos e o bairro da praia, e só dela', () => {
    const c = ok(approveBeach(catalog(), 'Praia A'));
    expect(c.beaches[0]!.points.every((p) => p.verified)).toBe(true);
    expect(c.beaches[0]!.neighborhoodVerified).toBe(true);
    expect(c.beaches[1]!.points[0]!.verified).toBe(false);
  });
  it('recusa praia com ponto sem posição', () => {
    const r = approveBeach(catalog(), 'Praia B');
    expect(r).toMatchObject({ ok: false });
  });
  it('recusa praia sem bairro', () => {
    const c = catalog();
    c.beaches[0]!.neighborhood = '  ';
    expect(approveBeach(c, 'Praia A')).toMatchObject({ ok: false });
  });
  it('recusa praia inexistente', () => {
    expect(approveBeach(catalog(), 'Nada')).toMatchObject({ ok: false });
  });
});

describe('movePoint', () => {
  it('grava source manual e guarda a proposta original', () => {
    const c = ok(movePoint(catalog(), 'Praia A', 'SSA 1', -12.95, -38.45, DAY));
    const p = c.beaches[0]!.points[0]!;
    expect(p).toMatchObject({ lat: -12.95, lng: -38.45 });
    expect(p.source).toEqual({
      provider: 'manual',
      method: 'manual',
      editedAt: DAY,
    });
    expect(p.proposals).toEqual([osm]);
    expect(c.beaches[0]!.points[1]!.source).toEqual(osm);
  });
  it('não duplica a proposta ao mover de novo', () => {
    let c = ok(movePoint(catalog(), 'Praia A', 'SSA 1', -12.95, -38.45, DAY));
    c = ok(movePoint(c, 'Praia A', 'SSA 1', -12.96, -38.46, DAY));
    expect(c.beaches[0]!.points[0]!.proposals).toHaveLength(1);
  });
  it('posiciona um ponto sem posição', () => {
    const c = ok(movePoint(catalog(), 'Praia B', 'SSA 3', -12.97, -38.5, DAY));
    expect(c.beaches[1]!.points[0]).toMatchObject({
      lat: -12.97,
      source: { method: 'manual' },
      proposals: [],
    });
  });
  it('tira a aprovação do ponto movido', () => {
    let c = ok(approveBeach(catalog(), 'Praia A'));
    c = ok(movePoint(c, 'Praia A', 'SSA 2', -12.92, -38.42, DAY));
    expect(c.beaches[0]!.points[1]!.verified).toBe(false);
    expect(beachState(c.beaches[0]!)).toBe('proposed');
  });
  it('recusa coordenada fora de Salvador e ponto inexistente', () => {
    expect(movePoint(catalog(), 'Praia A', 'SSA 1', 0, 0, DAY)).toMatchObject({
      ok: false,
    });
    expect(
      movePoint(catalog(), 'Praia A', 'XXX', -12.9, -38.4, DAY),
    ).toMatchObject({ ok: false });
  });
  it('não altera o catálogo original', () => {
    const c = catalog();
    movePoint(c, 'Praia A', 'SSA 1', -12.95, -38.45, DAY);
    expect(c).toEqual(catalog());
  });
});

describe('setNeighborhood', () => {
  const reverse: OsmSource = {
    ...osm,
    method: 'reverse',
    confidence: 'medium',
  };
  it('edição manual marca manual, guarda a proposta e tira a aprovação', () => {
    let c = ok(approveBeach(catalog(), 'Praia A'));
    c = ok(setNeighborhood(c, 'Praia A', ' Barra ', DAY));
    const b = c.beaches[0]!;
    expect(b.neighborhood).toBe('Barra');
    expect(b.neighborhoodSource).toMatchObject({ method: 'manual' });
    expect(b.neighborhoodProposals).toEqual([osm]);
    expect(b.neighborhoodVerified).toBe(false);
  });
  it('sugestão da consulta inversa mantém a origem OSM', () => {
    const c = ok(setNeighborhood(catalog(), 'Praia B', 'Ondina', DAY, reverse));
    expect(c.beaches[1]!.neighborhoodSource).toEqual(reverse);
  });
  it('ignora sugestão que não veio da consulta inversa', () => {
    const c = ok(setNeighborhood(catalog(), 'Praia B', 'Ondina', DAY, osm));
    expect(c.beaches[1]!.neighborhoodSource).toMatchObject({
      method: 'manual',
    });
  });
  it('texto vazio limpa o bairro', () => {
    const c = ok(setNeighborhood(catalog(), 'Praia A', '  ', DAY));
    expect(c.beaches[0]).toMatchObject({
      neighborhood: null,
      neighborhoodSource: null,
      neighborhoodProposals: [osm],
    });
  });
});

describe('validateForWrite', () => {
  it('aceita o resultado de qualquer ação válida', () => {
    const prev = catalog();
    const next = ok(movePoint(prev, 'Praia A', 'SSA 1', -12.95, -38.45, DAY));
    expect(validateForWrite(prev, next)).toEqual([]);
    expect(validateForWrite(prev, ok(approveBeach(prev, 'Praia A')))).toEqual(
      [],
    );
  });
  it('recusa schema, renomeação e troca de códigos', () => {
    const prev = catalog();
    const bad = catalog();
    (bad as { schemaVersion: number }).schemaVersion = 3;
    bad.beaches[0]!.name = 'Outra';
    bad.beaches[1]!.points[0]!.code = 'ZZZ';
    const errors = validateForWrite(prev, bad);
    expect(errors.some((e) => e.includes('schemaVersion'))).toBe(true);
    expect(errors.some((e) => e.includes('renomeada'))).toBe(true);
    expect(errors.some((e) => e.includes('códigos'))).toBe(true);
  });
  it('recusa coordenada fora de Salvador, metade das coordenadas e verificado sem posição', () => {
    const prev = catalog();
    const bad = catalog();
    bad.beaches[0]!.points[0]!.lat = 10;
    bad.beaches[0]!.points[1]!.lng = null;
    bad.beaches[1]!.points[0]!.verified = true;
    const text = validateForWrite(prev, bad).join('\n');
    expect(text).toContain('fora de Salvador');
    expect(text).toContain('só uma das coordenadas');
    expect(text).toContain('verificado sem coordenadas');
  });
  it('recusa mover sem source manual e proposta não preservada', () => {
    const prev = catalog();
    const bad = catalog();
    bad.beaches[0]!.points[0]!.lat = -12.95;
    bad.beaches[0]!.points[0]!.lng = -38.45;
    expect(validateForWrite(prev, bad).join('\n')).toContain('source manual');
    bad.beaches[0]!.points[0]!.source = {
      provider: 'manual',
      method: 'manual',
      editedAt: DAY,
    };
    expect(validateForWrite(prev, bad).join('\n')).toContain('preservada');
  });
  it('recusa histórico apagado e bairro verificado vazio', () => {
    const prev = ok(
      movePoint(catalog(), 'Praia A', 'SSA 1', -12.95, -38.45, DAY),
    );
    const bad = structuredClone(prev);
    bad.beaches[0]!.points[0]!.proposals = [];
    bad.beaches[0]!.neighborhood = null;
    bad.beaches[0]!.neighborhoodVerified = true;
    const text = validateForWrite(prev, bad).join('\n');
    expect(text).toContain('histórico de propostas apagado');
    expect(text).toContain('bairro verificado sem bairro');
  });
  it('recusa código repetido', () => {
    const prev = catalog();
    const bad = catalog();
    prev.beaches[1]!.points[0]!.code = 'SSA 1';
    bad.beaches[1]!.points[0]!.code = 'SSA 1';
    expect(validateForWrite(prev, bad).join('\n')).toContain('repetido');
  });
});

describe('migrateCatalog', () => {
  it('v3 ganha proposals vazios e vira v4', () => {
    const v3 = structuredClone(catalog()) as unknown as {
      schemaVersion: number;
      beaches: Record<string, unknown>[];
    };
    v3.schemaVersion = 3;
    for (const b of v3.beaches) {
      delete b.neighborhoodProposals;
      for (const p of b.points as Record<string, unknown>[]) delete p.proposals;
    }
    const c = migrateCatalog(v3);
    expect(c.schemaVersion).toBe(4);
    expect(c.beaches[0]!.neighborhoodProposals).toEqual([]);
    expect(c.beaches[0]!.points[0]!.proposals).toEqual([]);
  });
  it('recusa versão desconhecida', () => {
    expect(() => migrateCatalog({ schemaVersion: 2 })).toThrow();
  });
});

describe('parseAction e applyAction', () => {
  it('lê cada tipo de ação e recusa corpo inválido', () => {
    expect(parseAction({ type: 'approve', beach: 'Praia A' })).toEqual({
      type: 'approve',
      beach: 'Praia A',
    });
    expect(
      parseAction({ type: 'move', beach: 'A', code: 'S', lat: 'x', lng: 1 }),
    ).toBeTypeOf('string');
    expect(parseAction({ type: 'zzz', beach: 'A' })).toBeTypeOf('string');
    expect(parseAction(null)).toBeTypeOf('string');
  });
  it('applyAction despacha para a função certa', () => {
    const r = applyAction(
      catalog(),
      { type: 'approve', beach: 'Praia A' },
      DAY,
    );
    expect(r.ok).toBe(true);
  });
});

describe('reverseSuggestion', () => {
  const result = {
    osm_type: 'way',
    osm_id: 9,
    lat: '-12.9',
    lon: '-38.4',
    display_name: 'Rua, Ondina, Salvador',
    address: { suburb: 'Ondina' },
  };
  it('monta a sugestão com origem reverse', () => {
    const s = reverseSuggestion(result, -12.9, -38.4, DAY);
    expect(s?.neighborhood).toBe('Ondina');
    expect(s?.source).toMatchObject({
      provider: 'osm',
      method: 'reverse',
      osmId: 9,
      fetchedAt: DAY,
    });
  });
  it('sem bairro na resposta, não sugere', () => {
    expect(reverseSuggestion({ ...result, address: {} }, 0, 0, DAY)).toBeNull();
  });
});
