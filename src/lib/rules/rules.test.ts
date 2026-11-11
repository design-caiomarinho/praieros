import { describe, expect, it } from 'vitest';
import { STALE_BULLETINS_LIMIT } from './config.ts';
import {
  currentBulletin,
  evaluateBeaches,
  summarize,
  worstStatus,
} from './evaluate.ts';
import { beachKey, normalizeBeachName } from './group.ts';
import type { BeachState, Category, RuleBulletin, RulePoint } from './types.ts';

const pt = (
  code: string,
  beach: string,
  category: Category | null,
): RulePoint => ({ code, beach, category });

/** Boletim nº n de 2026, emitido em 2026-01-DD (DD = n). */
const bulletin = (n: number, points: RulePoint[]): RuleBulletin => ({
  number: n,
  year: 2026,
  issuedAt: `2026-01-${String(n).padStart(2, '0')}`,
  points,
});

const beach = (bs: RuleBulletin[], name: string, opts = {}): BeachState => {
  const found = evaluateBeaches(bs, opts).beaches.find((b) => b.name === name);
  if (!found) throw new Error(`praia ${name} não encontrada`);
  return found;
};

describe('config', () => {
  it('STALE_BULLETINS_LIMIT é 3', () => {
    expect(STALE_BULLETINS_LIMIT).toBe(3);
  });
});

describe('R1: boletim atual', () => {
  it('é o mais recente, independente da ordem recebida', () => {
    const bs = [bulletin(5, []), bulletin(7, []), bulletin(6, [])];
    expect(currentBulletin(bs)?.number).toBe(7);
  });
  it('vira o ano: 1/2027 é mais recente que 52/2026', () => {
    const a = { ...bulletin(52, []), year: 2026 };
    const b = { ...bulletin(1, []), year: 2027 };
    expect(currentBulletin([b, a])?.year).toBe(2027);
  });
  it('sem boletins: nada atual e nenhuma praia', () => {
    expect(evaluateBeaches([])).toEqual({ current: null, beaches: [] });
  });
});

describe('estados da ficha (tabela do CLAUDE.md)', () => {
  it('no boletim atual, própria', () => {
    const b = beach(
      [bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')])],
      'Barra',
    );
    expect(b.kind).toBe('current');
    expect(b.worstStatus).toBe('Própria');
    expect(b.stalePoints).toBe(0);
    expect(b.displayDate).toBe('2026-01-01');
  });

  it('no boletim atual, imprópria', () => {
    const b = beach(
      [bulletin(1, [pt('SSA AA 100', 'Barra', 'Imprópria')])],
      'Barra',
    );
    expect(b.kind).toBe('current');
    expect(b.worstStatus).toBe('Imprópria');
    expect(b.stalePoints).toBe(0);
    expect(b.displayDate).toBe('2026-01-01');
  });

  it('no boletim atual, sem informação', () => {
    const b = beach([bulletin(1, [pt('SSA AA 100', 'Barra', null)])], 'Barra');
    expect(b.kind).toBe('current');
    expect(b.points[0]!.status).toBe('Sem resultado');
    expect(b.worstStatus).toBe('Sem resultado');
    expect(b.stalePoints).toBe(0);
    expect(b.displayDate).toBe('2026-01-01');
  });

  it('nunca apareceu: só o catálogo conhece a praia', () => {
    const bs = [bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')])];
    const b = beach(bs, 'Jaguaribe', { catalog: [{ name: 'Jaguaribe' }] });
    expect(b.kind).toBe('never');
    expect(b.points).toEqual([]);
    expect(b.worstStatus).toBe('Sem resultado');
    expect(b.stalePoints).toBe(0);
    expect(b.displayDate).toBe('2026-01-01'); // data do boletim atual
    expect(b.lastAnalysisDate).toBeNull();
  });

  it('antigo demais: mais de N boletins sem aparecer', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Barra', 'Imprópria')]),
      bulletin(2, []),
      bulletin(3, []),
      bulletin(4, []),
      bulletin(5, []), // 4 boletins depois da última aparição (> 3)
    ];
    const b = beach(bs, 'Barra');
    expect(b.kind).toBe('too-old');
    expect(b.points[0]!.status).toBe('Sem resultado'); // nunca o status antigo
    expect(b.worstStatus).toBe('Sem resultado');
    expect(b.stalePoints).toBe(0);
    expect(b.displayDate).toBe('2026-01-05'); // boletim atual
    expect(b.lastAnalysisDate).toBe('2026-01-01');
  });

  it('fora do boletim atual, já teve resultado: mantém status e data da última aparição', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Barra', 'Imprópria')]),
      bulletin(2, []),
    ];
    const b = beach(bs, 'Barra');
    expect(b.kind).toBe('stale');
    expect(b.points[0]!.status).toBe('Imprópria');
    expect(b.worstStatus).toBe('Imprópria');
    expect(b.stalePoints).toBe(1);
    expect(b.displayDate).toBe('2026-01-01'); // última aparição
    expect(b.lastAnalysisDate).toBeNull();
  });
});

describe('D3: limite de boletins sem aparecer', () => {
  const base = (missed: number) => [
    bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')]),
    ...Array.from({ length: missed }, (_, i) => bulletin(i + 2, [])),
  ];

  it('exatamente N boletins ainda é desatualizada', () => {
    expect(beach(base(3), 'Barra').kind).toBe('stale');
  });
  it('N + 1 vira sem resultado', () => {
    expect(beach(base(4), 'Barra').kind).toBe('too-old');
  });
  it('o limite é configurável por chamada', () => {
    expect(beach(base(2), 'Barra', { staleLimit: 1 }).kind).toBe('too-old');
    expect(beach(base(5), 'Barra', { staleLimit: 5 }).kind).toBe('stale');
  });
  it('voltar a aparecer zera a contagem', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')]),
      bulletin(2, []),
      bulletin(3, []),
      bulletin(4, [pt('SSA AA 100', 'Barra', 'Imprópria')]),
    ];
    expect(beach(bs, 'Barra').kind).toBe('current');
  });
  it('D5: sem boletim novo, nada muda com o tempo', () => {
    const bs = [bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')])];
    expect(evaluateBeaches(bs)).toEqual(evaluateBeaches(bs));
    expect(beach(bs, 'Barra').kind).toBe('current');
  });
});

describe('R2: último boletim em que apareceu', () => {
  it('usa o resultado mais recente, não o mais antigo', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')]),
      bulletin(2, [pt('SSA AA 100', 'Barra', 'Imprópria')]),
      bulletin(3, []),
    ];
    const b = beach(bs, 'Barra');
    expect(b.points[0]!.status).toBe('Imprópria');
    expect(b.displayDate).toBe('2026-01-02');
  });
  it('ignora aparição sem informação ao buscar o último resultado', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Barra', 'Própria')]),
      bulletin(2, [pt('SSA AA 100', 'Barra', null)]),
      bulletin(3, []),
    ];
    const b = beach(bs, 'Barra');
    expect(b.kind).toBe('stale');
    expect(b.points[0]!.status).toBe('Própria');
    expect(b.displayDate).toBe('2026-01-01');
  });
  it('só apareceu sem informação: nunca teve resultado', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Barra', null)]),
      bulletin(2, []),
    ];
    expect(beach(bs, 'Barra').kind).toBe('never');
  });
});

describe('D1: pior status entre os pontos', () => {
  const three = [
    pt('SSA FB 100', 'Farol da Barra', 'Própria'),
    pt('SSA FB 200', 'Farol da Barra', 'Imprópria'),
    pt('SSA FB 300', 'Farol da Barra', 'Própria'),
  ];
  it('1 de 3 pontos impróprios => Imprópria', () => {
    const b = beach([bulletin(1, three)], 'Farol da Barra');
    expect(b.worstStatus).toBe('Imprópria');
    expect(b.improperPoints).toBe(1);
    expect(b.shownPoints).toBe(3);
  });
  it('todos próprios => Própria', () => {
    const ps = three.map((p) => ({ ...p, category: 'Própria' as const }));
    expect(beach([bulletin(1, ps)], 'Farol da Barra').worstStatus).toBe(
      'Própria',
    );
  });
  it('própria + sem informação => Própria', () => {
    const ps = [
      pt('SSA FB 100', 'Farol da Barra', 'Própria'),
      pt('SSA FB 200', 'Farol da Barra', null),
    ];
    expect(beach([bulletin(1, ps)], 'Farol da Barra').worstStatus).toBe(
      'Própria',
    );
  });
  it('worstStatus puro', () => {
    expect(worstStatus([])).toBe('Sem resultado');
    expect(worstStatus(['Própria', 'Imprópria', 'Sem resultado'])).toBe(
      'Imprópria',
    );
  });
});

describe('praia com pontos em estados diferentes', () => {
  it('um ponto some do boletim: só ele fica desatualizado, a praia segue atual', () => {
    const bs = [
      bulletin(1, [
        pt('SSA FB 100', 'Farol da Barra', 'Própria'),
        pt('SSA FB 200', 'Farol da Barra', 'Imprópria'),
      ]),
      bulletin(2, [pt('SSA FB 100', 'Farol da Barra', 'Própria')]),
    ];
    const b = beach(bs, 'Farol da Barra');
    expect(b.kind).toBe('current');
    expect(b.stalePoints).toBe(1);
    expect(b.points.map((p) => p.kind)).toEqual(['current', 'stale']);
    expect(b.worstStatus).toBe('Imprópria'); // o ponto desatualizado mantém o último status
  });
});

describe('agrupamento e renomeação', () => {
  it('normaliza caixa, acento e espaços', () => {
    expect(normalizeBeachName('  São  Tomé de Paripe ')).toBe(
      'sao tome de paripe',
    );
  });
  it('mesmo código em praias diferentes não se mistura', () => {
    const bs = [
      bulletin(1, [
        pt('SSA CO 100', 'Corsário', 'Própria'),
        pt('SSA CO 200', 'Patamares', 'Imprópria'),
      ]),
    ];
    expect(beach(bs, 'Corsário').worstStatus).toBe('Própria');
    expect(beach(bs, 'Patamares').worstStatus).toBe('Imprópria');
  });
  it('mudança de nome sem alias: nome novo é praia nova e o antigo fica desatualizado', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Praia Velha', 'Imprópria')]),
      bulletin(2, [pt('SSA AA 100', 'Praia Nova', 'Própria')]),
    ];
    const old = beach(bs, 'Praia Velha');
    expect(old.kind).toBe('stale');
    expect(old.worstStatus).toBe('Imprópria');
    expect(beach(bs, 'Praia Nova').kind).toBe('current');
  });
  it('mudança de nome com alias aprovado: é a mesma praia', () => {
    const bs = [
      bulletin(1, [pt('SSA AA 100', 'Praia Velha', 'Imprópria')]),
      bulletin(2, [pt('SSA AA 100', 'Praia Nova', 'Própria')]),
    ];
    const result = evaluateBeaches(bs, {
      aliases: { 'Praia Velha': 'Praia Nova' },
    });
    expect(result.beaches).toHaveLength(1);
    expect(result.beaches[0]!.name).toBe('Praia Nova');
    expect(result.beaches[0]!.kind).toBe('current');
    expect(result.beaches[0]!.worstStatus).toBe('Própria');
  });
  it('beachKey não encadeia aliases', () => {
    expect(beachKey('A', { A: 'B', B: 'C' })).toBe('b');
  });
});

describe('D2: resumo conta pontos', () => {
  it('conta próprias, impróprias e sem resultado por ponto', () => {
    const bs = [
      bulletin(1, [pt('SSA OL 100', 'Antiga', 'Própria')]),
      bulletin(2, []),
      bulletin(3, []),
      bulletin(4, []),
      bulletin(5, [
        pt('SSA FB 100', 'Farol da Barra', 'Própria'),
        pt('SSA FB 200', 'Farol da Barra', 'Imprópria'),
        pt('SSA FB 300', 'Farol da Barra', 'Imprópria'),
        pt('SSA XX 100', 'Sem Info', null),
      ]),
    ];
    const s = summarize(
      evaluateBeaches(bs, { catalog: [{ name: 'Jaguaribe' }] }).beaches,
    );
    // Antiga está antiga demais (4 > 3) => Sem resultado. Jaguaribe não tem pontos.
    expect(s).toEqual({ proper: 1, improper: 2, noResult: 2, totalPoints: 5 });
  });
});
