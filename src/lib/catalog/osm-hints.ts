import { normalizeBeachName } from '../rules/group.ts';

/** Nome do boletim -> nome usado no OpenStreetMap (`data/catalog/osm-name-hints.json`). */
export type OsmNameHints = Readonly<Record<string, string>>;

/**
 * Nome a usar SÓ na busca da praia no OpenStreetMap. Sem dica, é o próprio nome do boletim.
 * Não muda o nome exibido nem gravado no catálogo (princípio 1). Compara sem caixa nem acento
 * e não encadeia. Função pura.
 */
export function osmSearchName(
  beachName: string,
  hints: OsmNameHints = {},
): string {
  const key = normalizeBeachName(beachName);
  for (const [from, to] of Object.entries(hints)) {
    if (normalizeBeachName(from) === key) return to;
  }
  return beachName;
}
