import type { BeachAliases } from './types.ts';

/** Chave de comparação do nome da praia: sem caixa, acento nem espaços repetidos. */
export function normalizeBeachName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave da praia, aplicando uma renomeação aprovada (no máximo uma vez, sem encadear). */
export function beachKey(name: string, aliases: BeachAliases = {}): string {
  const key = normalizeBeachName(name);
  for (const [from, to] of Object.entries(aliases)) {
    if (normalizeBeachName(from) === key) return normalizeBeachName(to);
  }
  return key;
}
