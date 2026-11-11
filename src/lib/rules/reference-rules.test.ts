import { describe, expect, it } from 'vitest';
import { STALE_BULLETINS_LIMIT } from './config.ts';
import { evaluateBeaches, summarize } from './evaluate.ts';
import type { Category, RuleBulletin, RulePoint } from './types.ts';

// Boletins sintéticos: só aqui, nunca em data/bulletins/.
const pt = (code: string, beach: string, category: Category): RulePoint => ({
  code,
  beach,
  category,
});
const bulletin = (n: number, points: RulePoint[]): RuleBulletin => ({
  number: n,
  year: 2026,
  issuedAt: `2026-01-${String(n).padStart(2, '0')}`,
  points,
});
const find = (ev: ReturnType<typeof evaluateBeaches>, name: string) => {
  const b = ev.beaches.find((x) => x.name === name);
  if (!b) throw new Error(`praia ${name} não encontrada`);
  return b;
};

const bs = [
  bulletin(1, [
    pt('A1', 'Praia A', 'Imprópria'),
    pt('B1', 'Praia B', 'Própria'),
  ]),
  bulletin(2, [pt('B1', 'Praia B', 'Própria')]),
];

describe('praias de referência, nunca vistas e desatualizadas', () => {
  it('referência: sem resultado, sem pontos, com a data do boletim atual (R4a)', () => {
    const ev = evaluateBeaches(bs, { reference: [{ name: 'Praia Solta' }] });
    const ref = find(ev, 'Praia Solta');
    expect(ref.kind).toBe('reference');
    expect(ref.points).toEqual([]);
    expect(ref.worstStatus).toBe('no-result');
    expect(ref.displayDate).toBe('2026-01-02');
    expect(ref.lastAnalysisDate).toBeNull();
  });

  it('referência com nome de praia do boletim é ignorada (vale o boletim)', () => {
    const ev = evaluateBeaches(bs, {
      reference: [{ name: 'praia b' }, { name: 'PRAIA A' }],
    });
    expect(ev.beaches.filter((b) => b.kind === 'reference')).toEqual([]);
    expect(ev.beaches).toHaveLength(2);
  });

  it('referência não entra no resumo (D2 conta só pontos de coleta)', () => {
    const withRef = evaluateBeaches(bs, {
      reference: [{ name: 'Praia Solta' }],
    });
    expect(summarize(withRef.beaches)).toEqual(
      summarize(evaluateBeaches(bs).beaches),
    );
  });

  it('praia do catálogo que nunca apareceu: never (R4a)', () => {
    const ev = evaluateBeaches(bs, { catalog: [{ name: 'Praia Nova' }] });
    expect(find(ev, 'Praia Nova').kind).toBe('never');
  });

  it('praia que saiu do boletim atual: desatualizada, último status e data da última aparição (R3)', () => {
    const a = find(evaluateBeaches(bs), 'Praia A');
    expect(a.kind).toBe('stale');
    expect(a.worstStatus).toBe('unsuitable');
    expect(a.displayDate).toBe('2026-01-01');
  });

  it('passou do limite de boletins sem aparecer: sem resultado e só a data da última análise (R4b)', () => {
    const many = [
      bulletin(1, [pt('A1', 'Praia A', 'Imprópria')]),
      ...Array.from({ length: STALE_BULLETINS_LIMIT + 1 }, (_, i) =>
        bulletin(i + 2, [pt('B1', 'Praia B', 'Própria')]),
      ),
    ];
    const a = find(evaluateBeaches(many), 'Praia A');
    expect(a.kind).toBe('too-old');
    expect(a.worstStatus).toBe('no-result');
    expect(a.lastAnalysisDate).toBe('2026-01-01');
  });
});
