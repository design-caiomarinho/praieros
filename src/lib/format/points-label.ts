/** "1 ponto de coleta" / "3 pontos de coleta" (singular e plural corretos). */
export function pointsLabel(count: number): string {
  return `${count} ${count === 1 ? 'ponto' : 'pontos'} de coleta`;
}
