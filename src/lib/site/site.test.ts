import { describe, expect, it } from 'vitest';
import { buildCatalogTodo } from '../catalog/todo.ts';
import type { Catalog } from '../catalog/types.ts';
import { validateCatalog } from '../catalog/validate-catalog.ts';
import type { Category, RuleBulletin, RulePoint } from '../rules/types.ts';
import { beachSlug, buildSiteModel } from './build-beach-models.ts';

const pt = (
  code: string,
  beach: string,
  category: Category | null,
): RulePoint => ({ code, beach, category, location: `local ${code}` });

const bulletin = (n: number, points: RulePoint[]): RuleBulletin => ({
  number: n,
  year: 2026,
  issuedAt: `2026-01-${String(n).padStart(2, '0')}`,
  points,
});

interface LooseBeach {
  name: string;
  neighborhood: string | null;
  neighborhoodVerified?: boolean;
  points: {
    code: string;
    lat: number | null;
    lng: number | null;
    verified?: boolean;
  }[];
}

/** Monta o catálogo completo a partir de dados mínimos. Ponto com coordenadas completas é verificado, salvo indicação. */
const catalog = (beaches: LooseBeach[]): Catalog => ({
  schemaVersion: 4,
  region: 'salvador',
  beaches: beaches.map((b) => ({
    name: b.name,
    neighborhood: b.neighborhood,
    neighborhoodSource: null,
    neighborhoodProposals: [],
    neighborhoodVerified: b.neighborhoodVerified ?? b.neighborhood !== null,
    proposalNote: null,
    points: b.points.map((p) => ({
      code: p.code,
      lat: p.lat,
      lng: p.lng,
      source: null,
      proposals: [],
      verified: p.verified ?? (p.lat !== null && p.lng !== null),
    })),
  })),
});

const at = { lat: -12.97, lng: -38.5 };

describe('validateCatalog', () => {
  const cat = catalog([
    {
      name: 'A',
      neighborhood: null,
      points: [
        { code: 'P1', ...at },
        { code: 'P2', lat: null, lng: null },
      ],
    },
    { name: 'B', neighborhood: 'X', points: [{ code: 'P9', ...at }] },
  ]);

  it('reporta faltantes, sobras e pontos sem coordenada', () => {
    const r = validateCatalog(cat, [
      pt('P1', 'A', 'Própria'),
      pt('P2', 'A', 'Própria'),
      pt('P3', 'A', 'Própria'),
    ]);
    expect(r.missing).toEqual([{ code: 'P3', beach: 'A' }]);
    expect(r.extra).toEqual([{ code: 'P9', beach: 'B' }]);
    expect(r.unmapped).toEqual([{ code: 'P2', beach: 'A' }]);
    expect(r.ok).toBe(false);
  });

  it('sem faltantes nem inválidos, está ok (sobra e sem coordenada são avisos)', () => {
    const r = validateCatalog(cat, [
      pt('P1', 'A', 'Própria'),
      pt('P2', 'A', 'Própria'),
    ]);
    expect(r.ok).toBe(true);
    expect(r.extra).toHaveLength(1);
    expect(r.unmapped).toHaveLength(1);
  });

  it('rejeita código repetido, coordenada pela metade e fora de Salvador', () => {
    const bad = catalog([
      {
        name: 'A',
        neighborhood: null,
        points: [
          { code: 'P1', ...at },
          { code: 'P1', ...at },
          { code: 'P2', lat: -12.9, lng: null },
          { code: 'P3', lat: 40, lng: -38.5 },
        ],
      },
    ]);
    const r = validateCatalog(bad, []);
    expect(r.invalid.map((i) => `${i.code}:${i.reason}`)).toEqual([
      'P1:código repetido',
      'P2:só uma das coordenadas',
      'P3:coordenada fora de Salvador',
    ]);
    expect(r.ok).toBe(false);
  });
});

describe('buildCatalogTodo', () => {
  it('lista bairro e coordenadas pendentes com o local do boletim', () => {
    const cat = catalog([
      {
        name: 'A',
        neighborhood: null,
        points: [{ code: 'P1', lat: null, lng: null }],
      },
      { name: 'B', neighborhood: 'X', points: [{ code: 'P2', ...at }] },
    ]);
    const md = buildCatalogTodo(cat, [pt('P1', 'A', 'Própria')]);
    expect(md).toContain('## A');
    expect(md).toContain('- [ ] Bairro');
    expect(md).toContain('`P1`: local P1');
    expect(md).not.toContain('## B');
  });
});

describe('buildSiteModel', () => {
  const cat = catalog([
    {
      name: 'Própria',
      neighborhood: 'N1',
      points: [{ code: 'A1', ...at }],
    },
    {
      name: 'Mista',
      neighborhood: null,
      points: [
        { code: 'M1', ...at },
        { code: 'M2', lat: null, lng: null },
      ],
    },
    { name: 'Sumida', neighborhood: null, points: [{ code: 'S1', ...at }] },
    { name: 'Velha', neighborhood: null, points: [{ code: 'V1', ...at }] },
    { name: 'Nunca', neighborhood: null, points: [{ code: 'N1', ...at }] },
    { name: 'Vazia', neighborhood: null, points: [{ code: 'Z1', ...at }] },
  ]);

  // Sumida aparece só no boletim 1 (1 boletim sem aparecer). Velha só no 1, mas com limite 0 vira too-old.
  const bs = [
    bulletin(1, [
      pt('S1', 'Sumida', 'Imprópria'),
      pt('V1', 'Velha', 'Própria'),
      pt('A1', 'Própria', 'Própria'),
    ]),
    bulletin(2, [
      pt('A1', 'Própria', 'Própria'),
      pt('M1', 'Mista', 'Imprópria'),
      pt('M2', 'Mista', 'Própria'),
      pt('Z1', 'Vazia', null),
    ]),
  ];
  const model = buildSiteModel(bs, cat);
  const get = (name: string) => model.beaches.find((b) => b.name === name)!;

  it('boletim atual: própria, sem faixa, data do boletim atual', () => {
    const b = get('Própria');
    expect(b.kind).toBe('current');
    expect(b.points[0]!.status).toBe('suitable');
    expect(b.banner).toBe('none');
    expect(b.neighborhood).toBe('N1');
    expect(b.referenceBulletin).toMatchObject({ number: 2 });
  });

  it('vários pontos: pior status (D1) e ponto sem coordenada fora do mapa', () => {
    const b = get('Mista');
    expect(b.worstStatus).toBe('unsuitable');
    expect(b.improperPoints).toBe(1);
    expect(b.shownPoints).toBe(2);
    expect(b.points.map((p) => [p.code, p.onMap])).toEqual([
      ['M1', true],
      ['M2', false],
    ]);
    expect(b.points[1]!.position).toBeNull();
  });

  it('no boletim atual sem informação: Sem resultado, sem faixa', () => {
    const b = get('Vazia');
    expect(b.points[0]!.status).toBe('no-result');
    expect(b.banner).toBe('none');
    expect(b.referenceBulletin).toMatchObject({ number: 2 });
  });

  it('fora do boletim atual, já teve resultado: último status, faixa e data da última aparição', () => {
    const b = get('Sumida');
    expect(b.kind).toBe('stale');
    expect(b.worstStatus).toBe('unsuitable');
    expect(b.banner).toBe('outdated');
    expect(b.points[0]!.stale).toBe(true);
    expect(b.referenceBulletin).toMatchObject({ number: 1 });
  });

  it('nunca apareceu: Sem resultado, sem faixa, avisa que não consta', () => {
    const b = get('Nunca');
    expect(b.kind).toBe('never');
    expect(b.points[0]!.status).toBe('no-result');
    expect(b.points[0]!.bulletin).toBeNull();
    expect(b.banner).toBe('none');
    expect(b.notInCurrentBulletin).toBe(true);
    expect(b.referenceBulletin).toMatchObject({ number: 2 });
  });

  it('antiga demais (D3): só a data da última análise, nunca o status antigo', () => {
    const m = buildSiteModel(bs, cat, { staleLimit: 0 });
    const b = m.beaches.find((x) => x.name === 'Velha')!;
    expect(b.kind).toBe('too-old');
    expect(b.points[0]!.status).toBe('no-result');
    expect(b.banner).toBe('none');
    expect(b.lastAnalysisDate).toBe('2026-01-01');
    expect(b.referenceBulletin).toMatchObject({ number: 2 });
  });

  it('resumo conta pontos (D2) e o boletim atual é o mais recente', () => {
    expect(model.current).toMatchObject({ number: 2 });
    // Conta os pontos que já constaram em algum boletim (S1, V1, A1, M1, M2, Z1);
    // N1, que nunca constou, não entra. Ver docs/decisions.md.
    expect(model.summary).toEqual({
      proper: 3,
      improper: 2,
      noResult: 1,
      totalPoints: 6,
    });
  });

  it('sem boletins: nenhuma praia e sem boletim atual', () => {
    const m = buildSiteModel([], cat);
    expect(m.current).toBeNull();
    expect(m.beaches).toEqual([]);
  });
});

describe('beachSlug', () => {
  it('remove acento, caixa e pontuação', () => {
    expect(beachSlug('São Tomé de Paripe')).toBe('sao-tome-de-paripe');
    expect(beachSlug('  Praia do Porto da Barra ')).toBe(
      'praia-do-porto-da-barra',
    );
  });
});

describe('verified (produção x desenvolvimento)', () => {
  const cat = catalog([
    {
      name: 'A',
      neighborhood: 'Bairro proposto',
      neighborhoodVerified: false,
      points: [
        { code: 'P1', ...at, verified: false },
        { code: 'P2', ...at, verified: true },
      ],
    },
  ]);
  const bs = [
    bulletin(1, [pt('P1', 'A', 'Própria'), pt('P2', 'A', 'Imprópria')]),
  ];

  it('em produção nada não verificado aparece (posição nem bairro)', () => {
    const b = buildSiteModel(bs, cat).beaches[0]!;
    expect(b.neighborhood).toBeNull();
    expect(b.points.map((p) => [p.code, p.onMap, p.position])).toEqual([
      ['P1', false, null],
      ['P2', true, at],
    ]);
  });

  it('o status do boletim não depende de verified', () => {
    const b = buildSiteModel(bs, cat).beaches[0]!;
    expect(b.points.map((p) => p.status)).toEqual(['suitable', 'unsuitable']);
  });

  it('em desenvolvimento aparecem as propostas', () => {
    const b = buildSiteModel(bs, cat, { includeUnverified: true }).beaches[0]!;
    expect(b.neighborhood).toBe('Bairro proposto');
    expect(b.points.every((p) => p.onMap)).toBe(true);
  });

  it('validação avisa pontos não verificados e barra verificado sem coordenada', () => {
    const r = validateCatalog(cat, bs[0]!.points);
    expect(r.unverified).toEqual([{ code: 'P1', beach: 'A' }]);
    const bad = catalog([
      {
        name: 'A',
        neighborhood: null,
        points: [{ code: 'P1', lat: null, lng: null, verified: true }],
      },
    ]);
    expect(validateCatalog(bad, []).invalid[0]?.reason).toBe(
      'verificado sem coordenadas',
    );
  });

  it('todo pede conferência das propostas e lista descartes', () => {
    const withNote = catalog([
      {
        name: 'B',
        neighborhood: null,
        points: [{ code: 'Q1', lat: null, lng: null }],
      },
    ]);
    withNote.beaches[0]!.proposalNote = 'não encontrada';
    expect(buildCatalogTodo(cat, bs[0]!.points)).toContain(
      'Conferir posição de `P1`',
    );
    expect(buildCatalogTodo(cat, bs[0]!.points)).toContain('Conferir bairro');
    expect(buildCatalogTodo(withNote, [])).toContain(
      'Proposta descartada: não encontrada',
    );
  });
});

describe('posições em produção (verificado ou automático que passou em tudo)', () => {
  const pass = { status: 'pass' as const, meters: null };
  const fail = { status: 'fail' as const, meters: 120 };
  const auto = {
    provider: 'auto' as const,
    method: 'auto-placed' as const,
    basis: 'spread' as const,
    confidence: 'low' as const,
    query: null,
    geometry: ['way/1'],
    osm: null,
    placedAt: '2026-11-12',
  };
  const cat = catalog([
    {
      name: 'A',
      neighborhood: 'X',
      points: [
        { code: 'P1', ...at, verified: false },
        { code: 'P2', ...at, verified: false },
        { code: 'P3', ...at, verified: true },
        { code: 'P4', ...at, verified: false },
      ],
    },
  ]);
  const [p1, p2, , p4] = cat.beaches[0]!.points;
  p1!.source = auto;
  p1!.checks = { inSalvador: pass, nearBeach: pass, minSpacing: pass };
  p2!.source = auto;
  p2!.checks = { inSalvador: pass, nearBeach: fail, minSpacing: pass };
  p4!.source = { ...auto, basis: 'description-only' };
  p4!.checks = {
    inSalvador: pass,
    nearBeach: { status: 'n/a', meters: null },
    minSpacing: pass,
  };
  const bs = [
    bulletin(
      1,
      ['P1', 'P2', 'P3', 'P4'].map((c) => pt(c, 'A', 'Própria')),
    ),
  ];

  it('em produção: verificado e automático aprovado nas verificações; os demais ficam fora do mapa', () => {
    const points = buildSiteModel(bs, cat).beaches[0]!.points;
    const by = Object.fromEntries(points.map((p) => [p.code, p]));
    expect(by.P1).toMatchObject({ onMap: true, approximate: true });
    expect(by.P2).toMatchObject({ onMap: false, approximate: false });
    expect(by.P3).toMatchObject({ onMap: true, approximate: false });
    expect(by.P4).toMatchObject({ onMap: false }); // sem geometria no OSM: não vai
  });
  it('em desenvolvimento aparecem todos com posição', () => {
    const points = buildSiteModel(bs, cat, { includeUnverified: true })
      .beaches[0]!.points;
    expect(points.every((p) => p.onMap)).toBe(true);
  });
});
