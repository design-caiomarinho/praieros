/**
 * Lê um tempo de CSS em milissegundos. O CSS do build (minificado) reescreve `300ms` como `.3s`
 * e `1500ms` como `1.5s`: `parseFloat` sozinho leria 0,3 e 1,5 ms. Aceita `ms`, `s` e número puro.
 */
export function cssTimeMs(css: string): number {
  const m = css.trim().match(/^(-?\d*\.?\d+)(ms|s)?$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === 's' ? n * 1000 : n;
}
