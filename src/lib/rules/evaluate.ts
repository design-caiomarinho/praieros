import { STALE_BULLETINS_LIMIT } from './config.ts';
import { beachKey } from './group.ts';
import { categoryToStatus } from './status.ts';
import type {
  BeachAliases,
  BeachKind,
  BeachState,
  BulletinRef,
  CatalogBeach,
  Evaluation,
  PointState,
  ReferenceBeachName,
  RuleBulletin,
  Status,
  Summary,
} from './types.ts';

export interface EvaluateOptions {
  /** Praias conhecidas; as que nunca apareceram viram "never" (R4a). */
  catalog?: readonly CatalogBeach[];
  /**
   * Praias de referência (fora do boletim, sem ponto de coleta). Se o nome também existe no
   * boletim ou no catálogo, vale a praia do boletim e a referência é ignorada.
   */
  reference?: readonly ReferenceBeachName[];
  aliases?: BeachAliases;
  /** D3. Padrão: `STALE_BULLETINS_LIMIT`. */
  staleLimit?: number;
}

const compare = (a: BulletinRef, b: BulletinRef) =>
  a.year - b.year || a.number - b.number;

const ref = (b: RuleBulletin): BulletinRef => ({
  number: b.number,
  year: b.year,
  issuedAt: b.issuedAt,
});

/** R1: o boletim atual é o mais recente (ano, número). */
export function currentBulletin(
  bulletins: readonly RuleBulletin[],
): RuleBulletin | null {
  return [...bulletins].sort(compare).at(-1) ?? null;
}

const SEVERITY: Record<Status, number> = {
  'no-result': 0,
  suitable: 1,
  unsuitable: 2,
};

/** D1: pior status. Imprópria > Própria > Sem resultado. */
export function worstStatus(statuses: readonly Status[]): Status {
  return statuses.reduce<Status>(
    (worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst),
    'no-result',
  );
}

/**
 * Avalia R1–R4 e D1–D3 para todas as praias. Sem I/O; só conta os boletins
 * recebidos, então sem boletim novo nada muda (D5).
 * Identidade: ponto = praia (nome normalizado) + código; praia = nome normalizado.
 */
export function evaluateBeaches(
  bulletins: readonly RuleBulletin[],
  options: EvaluateOptions = {},
): Evaluation {
  const {
    catalog = [],
    reference = [],
    aliases = {},
    staleLimit = STALE_BULLETINS_LIMIT,
  } = options;
  const sorted = [...bulletins].sort(compare);
  const current = sorted.at(-1);
  if (!current) return { current: null, beaches: [] };

  // Nome de exibição: o do boletim mais recente em que a praia apareceu.
  const names = new Map<string, string>();
  for (const c of catalog) names.set(beachKey(c.name, aliases), c.name);
  const pointIds = new Map<string, { beach: string; code: string }>();
  for (const b of sorted) {
    for (const p of b.points) {
      const key = beachKey(p.beach, aliases);
      names.set(key, p.beach);
      pointIds.set(`${key}|${p.code}`, { beach: key, code: p.code });
    }
  }

  const stateOf = (beach: string, code: string): PointState | null => {
    const find = (b: RuleBulletin) =>
      b.points.find(
        (p) => p.code === code && beachKey(p.beach, aliases) === beach,
      );

    const now = find(current);
    if (now) {
      return {
        kind: 'current',
        code,
        location: now.location,
        status: categoryToStatus(now.category),
        bulletin: ref(current),
      };
    }
    // Último boletim com informação utilizável do ponto.
    for (let i = sorted.length - 2; i >= 0; i--) {
      const bulletin = sorted[i]!;
      const p = find(bulletin);
      if (!p || p.category === null) continue;
      const lastSeen = ref(bulletin);
      const bulletinsMissed = sorted.length - 1 - i;
      return bulletinsMissed > staleLimit
        ? {
            kind: 'too-old',
            code,
            location: p.location,
            status: 'no-result',
            lastSeen,
            bulletinsMissed,
          }
        : {
            kind: 'stale',
            code,
            location: p.location,
            status: categoryToStatus(p.category),
            lastSeen,
            bulletinsMissed,
          };
    }
    return null; // nunca teve informação
  };

  const beaches: BeachState[] = [];
  for (const [key, name] of names) {
    const points: PointState[] = [];
    for (const id of pointIds.values()) {
      if (id.beach !== key) continue;
      const s = stateOf(id.beach, id.code);
      if (s) points.push(s);
    }
    points.sort((a, b) => a.code.localeCompare(b.code));
    beaches.push(beachState(key, name, points, current));
  }
  // Praias de referência: só as que não existem no boletim nem no catálogo.
  for (const r of reference) {
    const key = beachKey(r.name, aliases);
    if (names.has(key)) continue;
    names.set(key, r.name);
    beaches.push({
      key,
      name: r.name,
      kind: 'reference',
      points: [],
      worstStatus: 'no-result',
      shownPoints: 0,
      improperPoints: 0,
      stalePoints: 0,
      displayDate: current.issuedAt,
      lastAnalysisDate: null,
    });
  }
  return {
    current: ref(current),
    beaches: beaches.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

function beachState(
  key: string,
  name: string,
  points: PointState[],
  current: RuleBulletin,
): BeachState {
  const shown = points.filter((p) => p.kind !== 'too-old');
  const stale = points.filter((p) => p.kind === 'stale');
  const kind: BeachKind = points.some((p) => p.kind === 'current')
    ? 'current'
    : stale.length > 0
      ? 'stale'
      : points.length > 0
        ? 'too-old'
        : 'never';

  const latestLastSeen =
    points
      .flatMap((p) => (p.kind === 'current' ? [] : [p.lastSeen]))
      .sort(compare)
      .at(-1) ?? null;

  return {
    key,
    name,
    kind,
    points,
    worstStatus: worstStatus(shown.map((p) => p.status)),
    shownPoints: shown.length,
    improperPoints: shown.filter((p) => p.status === 'unsuitable').length,
    stalePoints: stale.length,
    displayDate:
      kind === 'stale' ? (latestLastSeen?.issuedAt ?? null) : current.issuedAt,
    lastAnalysisDate:
      kind === 'too-old' ? (latestLastSeen?.issuedAt ?? null) : null,
  };
}

/** D2: resumo por pontos. Pontos antigos demais contam como "Sem resultado". */
export function summarize(beaches: readonly BeachState[]): Summary {
  const s: Summary = { proper: 0, improper: 0, noResult: 0, totalPoints: 0 };
  for (const b of beaches) {
    for (const p of b.points) {
      s.totalPoints++;
      if (p.status === 'suitable') s.proper++;
      else if (p.status === 'unsuitable') s.improper++;
      else s.noResult++;
    }
  }
  return s;
}
