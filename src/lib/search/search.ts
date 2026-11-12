import { normalizeBeachName } from '../rules/group.ts';
import type { ChipStatus } from '../rules/status.ts';
import type { BeachModel } from '../site/build-beach-models.ts';

/** Palavras ignoradas na comparação ("Praia do Forte" = "Forte"). */
const IGNORED_WORDS = new Set(['praia', 'de', 'do', 'da', 'dos', 'das']);

/** Palavras da busca: sem acento nem caixa, sem pontuação. */
function words(text: string): string[] {
  return normalizeBeachName(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Termos da busca sem "Praia", "de", "do", "da". */
export function queryTokens(text: string): string[] {
  const all = words(text);
  const kept = all.filter((w) => !IGNORED_WORDS.has(w));
  // Só palavras ignoradas (ex.: "praia"): compara com elas mesmas.
  return kept.length > 0 ? kept : all;
}

/** Forma mínima de uma praia para a busca. */
export interface Searchable {
  slug: string;
  name: string;
  neighborhood: string | null;
}

/** Quanto menor, melhor. `null` = não combina. */
function rank(item: Searchable, tokens: readonly string[]): number | null {
  if (tokens.length === 0) return null;
  const nameWords = words(item.name);
  const nameKept = nameWords.filter((w) => !IGNORED_WORDS.has(w));
  const nameText = (nameKept.length > 0 ? nameKept : nameWords).join(' ');
  const hoodWords = item.neighborhood ? words(item.neighborhood) : [];
  const startsWord = (pool: readonly string[], t: string) =>
    pool.some((w) => w.startsWith(t));

  // Os termos separados por espaço contam como uma frase no começo do nome.
  if (nameText.startsWith(tokens.join(' '))) return 0;
  if (tokens.every((t) => startsWord(nameWords, t))) return 1;
  if (tokens.every((t) => nameText.includes(t))) return 2;
  if (tokens.every((t) => startsWord([...nameWords, ...hoodWords], t)))
    return 3;
  return null;
}

/**
 * Praias que combinam com o texto, da mais à menos relevante: nome começa com o texto,
 * cada termo começa uma palavra do nome, o nome contém o texto, e por fim o bairro.
 * Empate em ordem alfabética (pt-BR). Texto vazio devolve lista vazia.
 */
export function searchBeaches<T extends Searchable>(
  items: readonly T[],
  query: string,
): T[] {
  const tokens = queryTokens(query);
  return items
    .flatMap((item) => {
      const r = rank(item, tokens);
      return r === null ? [] : [{ item, r }];
    })
    .sort(
      (a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name, 'pt-BR'),
    )
    .map((x) => x.item);
}

/**
 * Bairros sugeridos: os que têm ao menos uma praia, sem repetir (sem diferenciar acento
 * nem caixa), em ordem alfabética (pt-BR).
 */
export function suggestNeighborhoods(
  items: readonly { neighborhood: string | null }[],
): string[] {
  const seen = new Map<string, string>();
  for (const { neighborhood } of items) {
    const label = neighborhood?.trim();
    if (!label) continue;
    const key = normalizeBeachName(label);
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Linha de resultado da busca (derivada do modelo; sem regra de negócio nova). */
export interface SearchResult extends Searchable {
  /** D1: pior status dos pontos; "Sem resultado" para praia sem ponto com status. */
  status: ChipStatus;
  /** Fora do boletim atual, já com resultado (R3): mostra "Boletim desatualizado". */
  outdated: boolean;
  /** Total de pontos de coleta (0 em praia sem ponto). */
  pointCount: number;
  /** Pontos que mostram status (base do "N de M pontos impróprios"). */
  shownPoints: number;
  improperPoints: number;
  /** Tem marcador no mapa, então a ficha pode abrir. */
  selectable: boolean;
}

export function toSearchResults(
  beaches: readonly BeachModel[],
  slugsOnMap: ReadonlySet<string>,
): SearchResult[] {
  return beaches.map((b) => ({
    slug: b.slug,
    name: b.name,
    neighborhood: b.neighborhood,
    status: b.worstStatus,
    outdated: b.kind === 'stale',
    pointCount: b.isReference ? 0 : b.points.length,
    shownPoints: b.shownPoints,
    improperPoints: b.improperPoints,
    selectable: slugsOnMap.has(b.slug),
  }));
}

/**
 * D1: "1 de 3 pontos impróprios". Só com 2+ pontos e ao menos um impróprio; com 1 ponto o
 * chip já diz tudo, e praia sem ponto não tem contagem.
 */
export function improperSummary(
  r: Pick<SearchResult, 'improperPoints' | 'shownPoints'>,
): string | null {
  if (r.shownPoints < 2 || r.improperPoints < 1) return null;
  return `${r.improperPoints} de ${r.shownPoints} pontos impróprios`;
}
