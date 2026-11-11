import type { Category } from '../inema/bulletin.ts';

export type { Category };

/** Status exibível de um ponto ou praia. */
export type Status = Category | 'Sem resultado';

/** Ponto de um boletim. `category: null` = boletim sem informação utilizável do ponto. */
export interface RulePoint {
  code: string;
  beach: string;
  location?: string;
  category: Category | null;
}

/** Subconjunto de `StoredBulletin` que as regras usam (todos de uma mesma região). */
export interface RuleBulletin {
  number: number;
  year: number;
  /** AAAA-MM-DD. */
  issuedAt: string;
  points: RulePoint[];
}

export interface BulletinRef {
  number: number;
  year: number;
  issuedAt: string;
}

/** Praia conhecida pelo site, mesmo que nunca tenha aparecido em um boletim. */
export interface CatalogBeach {
  name: string;
  neighborhood?: string;
}

/** Tabela manual de renomeações aprovadas: nome antigo -> nome atual. */
export type BeachAliases = Readonly<Record<string, string>>;

interface PointBase {
  code: string;
  location?: string;
}

export type PointState =
  /** No boletim atual (R2). `status` é "Sem resultado" se o boletim não traz informação do ponto. */
  | (PointBase & { kind: 'current'; status: Status; bulletin: BulletinRef })
  /** R3: fora do boletim atual, mantém o último status e a data da última aparição. */
  | (PointBase & {
      kind: 'stale';
      status: Category;
      lastSeen: BulletinRef;
      bulletinsMissed: number;
    })
  /** R4(b): antigo demais. Só a data da última análise; nunca o status. */
  | (PointBase & {
      kind: 'too-old';
      status: 'Sem resultado';
      lastSeen: BulletinRef;
      bulletinsMissed: number;
    });

export type BeachKind =
  | 'current'
  | 'stale'
  | 'too-old'
  /** R4(a): nunca apareceu em nenhum boletim lido (ou só sem informação). */
  | 'never';

export interface BeachState {
  /** Nome normalizado (com aliases aplicados). */
  key: string;
  /** Nome como no último boletim em que apareceu (ou o do catálogo). */
  name: string;
  kind: BeachKind;
  points: PointState[];
  /** D1: pior status entre os pontos que mostram status. */
  worstStatus: Status;
  /** Pontos que mostram status (atuais e desatualizados). */
  shownPoints: number;
  improperPoints: number;
  /** Pontos desatualizados (faixa de aviso). Pode ser só parte dos pontos: ver docs/decisions.md. */
  stalePoints: number;
  /** Data (AAAA-MM-DD) a exibir: do boletim atual, ou da última aparição se `kind` for 'stale'. */
  displayDate: string | null;
  /** Para 'too-old': data da última análise. */
  lastAnalysisDate: string | null;
}

export interface Evaluation {
  /** R1: boletim atual (o mais recente). `null` se não há boletins. */
  current: BulletinRef | null;
  beaches: BeachState[];
}

export interface Summary {
  proper: number;
  improper: number;
  noResult: number;
  /** D2: o resumo conta pontos. */
  totalPoints: number;
}
