/** "0 ponto de coleta" / "1 ponto de coleta" / "3 pontos de coleta" (0 e 1 no singular, como no concept). */
export function pointsLabel(count: number): string {
  return `${count} ${count <= 1 ? 'ponto' : 'pontos'} de coleta`;
}
