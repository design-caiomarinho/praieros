/** "Nenhum ponto de coleta" / "1 ponto de coleta" / "3 pontos de coleta". */
export function pointsLabel(count: number): string {
  if (count <= 0) return 'Nenhum ponto de coleta';
  return `${count} ${count === 1 ? 'ponto' : 'pontos'} de coleta`;
}
