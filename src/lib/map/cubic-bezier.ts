/** Curva cúbica de Bézier como no CSS (`cubic-bezier(x1, y1, x2, y2)`): progresso x (0–1) → y. */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (x: number) => number {
  const at = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 40; i++) {
      const cx = at(t, x1, x2);
      if (Math.abs(cx - x) < 1e-6) break;
      if (cx < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return at(t, y1, y2);
  };
}

/** Lê `cubic-bezier(a, b, c, d)` (valor de um token CSS). Devolve a curva linear se não entender. */
export function parseCubicBezier(css: string): (x: number) => number {
  const n = css.match(/-?\d*\.?\d+/g)?.map(Number);
  return n && n.length === 4 ? cubicBezier(n[0], n[1], n[2], n[3]) : (x) => x;
}

/**
 * Fração do tempo (0–1) em que a curva chega a 50% do progresso, para o valor de um token CSS
 * `cubic-bezier(...)`. Usa a primeira vez que a curva cruza 0,5 (ela pode passar de 1).
 */
export function halfwayTime(css: string): number {
  const n = css.match(/-?\d*\.?\d+/g)?.map(Number);
  if (!n || n.length !== 4) return 0.5;
  const [x1, y1, x2, y2] = n;
  const at = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    if (at(t, y1, y2) < 0.5) lo = t;
    else hi = t;
  }
  return at((lo + hi) / 2, x1, x2);
}
