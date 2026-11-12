/** Palavras de ligação: somem junto com a palavra abreviada que vem antes delas. */
const LINKS = new Set(['de', 'do', 'da', 'dos', 'das']);

/**
 * Abreviação de nome longo para espaços curtos (botões de bairro): a primeira palavra vira
 * a inicial com ponto e a ligação que vem depois some ("Quilombo do Alto do Tororó" ->
 * "Q. Alto do Tororó"). Repete com a palavra seguinte enquanto passar de `max` caracteres e
 * sobrarem ao menos 3 palavras. Nome que cabe não muda. Quem usa deve manter o nome completo
 * acessível (rótulo para leitor de tela).
 */
export function abbreviateLabel(text: string, max = 20): string {
  const words = text.trim().split(/\s+/);
  const out: string[] = [];
  let rest = words;
  while (out.join(' ').length + rest.join(' ').length + 1 > max) {
    if (rest.length < 3) break;
    out.push(`${rest[0][0].toLocaleUpperCase('pt-BR')}.`);
    rest = rest.slice(1);
    if (LINKS.has(rest[0].toLowerCase()) && rest.length > 2)
      rest = rest.slice(1);
  }
  return [...out, ...rest].join(' ');
}
