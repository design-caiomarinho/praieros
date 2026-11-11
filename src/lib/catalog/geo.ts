// Geometria para o posicionamento automático. Tudo puro, em graus de entrada e metros de saída.
// A aproximação plana local é suficiente na escala de uma praia (dezenas a centenas de metros).

export interface LatLng {
  lat: number;
  lng: number;
}

/** Linha do OSM. `closed` = contorno fechado (área). */
export interface Line {
  pts: LatLng[];
  closed: boolean;
}

/** Geometria de uma praia: todas as linhas dos elementos do OSM que combinam com o nome. */
export interface Geometry {
  lines: Line[];
  /** Ex.: `way/123`, para o registro de origem. */
  ids: string[];
}

const EARTH_M = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distância em metros entre dois pontos (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Projeta `p` em metros, com `o` como origem. */
function local(p: LatLng, o: LatLng) {
  return {
    x: rad(p.lng - o.lng) * Math.cos(rad(o.lat)) * EARTH_M,
    y: rad(p.lat - o.lat) * EARTH_M,
  };
}

/** Distância em metros de `p` ao segmento `a`–`b`. */
export function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const pa = local(a, p);
  const pb = local(b, p);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, -(pa.x * dx + pa.y * dy) / len2));
  return Math.hypot(pa.x + t * dx, pa.y + t * dy);
}

/** Ponto dentro do anel (ray casting). */
export function inRing(p: LatLng, ring: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (
      a.lat > p.lat !== b.lat > p.lat &&
      p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Menor distância de `p` à geometria; 0 se `p` está dentro de um contorno fechado. Infinity se vazia. */
export function distanceToGeometryM(p: LatLng, g: Geometry): number {
  let best = Infinity;
  for (const line of g.lines) {
    if (line.closed && inRing(p, line.pts)) return 0;
    for (let i = 1; i < line.pts.length; i++) {
      best = Math.min(
        best,
        distanceToSegmentM(p, line.pts[i - 1]!, line.pts[i]!),
      );
    }
  }
  return best;
}

/** Polígono administrativo: anéis externos e internos (buracos). */
export interface Boundary {
  outer: LatLng[][];
  inner: LatLng[][];
}

/** Dentro do polígono: em algum anel externo e em nenhum interno. */
export function inBoundary(p: LatLng, b: Boundary): boolean {
  return (
    b.outer.some((r) => inRing(p, r)) && !b.inner.some((r) => inRing(p, r))
  );
}

const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

/** Junta trechos (ways) pelas pontas em anéis fechados. Trechos que não fecham são descartados. */
export function assembleRings(ways: readonly LatLng[][]): LatLng[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings: LatLng[][] = [];
  while (pool.length > 0) {
    let ring = pool.pop()!;
    let grew = true;
    while (grew && !same(ring[0]!, ring[ring.length - 1]!)) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i]!;
        const end = ring[ring.length - 1]!;
        if (same(w[0]!, end)) ring = ring.concat(w.slice(1));
        else if (same(w[w.length - 1]!, end))
          ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (same(ring[0]!, ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

/** Comprimento de uma linha em metros. */
export function lengthM(pts: readonly LatLng[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += distanceM(pts[i - 1]!, pts[i]!);
  return t;
}

/** Ponto a `d` metros do início da linha (limitado às pontas). */
export function pointAlong(pts: readonly LatLng[], d: number): LatLng {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = distanceM(a, b);
    if (left <= seg && seg > 0) {
      const t = left / seg;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
    }
    left -= seg;
  }
  return pts[pts.length - 1]!;
}

/**
 * Linha central aproximada da praia, onde distribuir pontos. Escolhe a maior entre as linhas
 * abertas (comprimento) e os contornos fechados (meio perímetro). Um contorno fechado vira o
 * arco entre os dois vértices mais distantes. Null se a geometria não tem linhas.
 */
export function spineOf(g: Geometry): LatLng[] | null {
  let best: { len: number; pts: LatLng[] } | null = null;
  for (const line of g.lines) {
    if (line.pts.length < 2) continue;
    if (!line.closed) {
      const len = lengthM(line.pts);
      if (!best || len > best.len) best = { len, pts: line.pts };
      continue;
    }
    const ring = line.pts.slice(0, -1);
    const step = Math.max(1, Math.floor(ring.length / 200));
    let far: [number, number] = [0, 0];
    let farD = -1;
    for (let i = 0; i < ring.length; i += step) {
      for (let j = i + step; j < ring.length; j += step) {
        const d = distanceM(ring[i]!, ring[j]!);
        if (d > farD) {
          farD = d;
          far = [i, j];
        }
      }
    }
    const arc = ring.slice(far[0], far[1] + 1);
    const len = lengthM(arc);
    if (arc.length >= 2 && (!best || len > best.len)) best = { len, pts: arc };
  }
  return best?.pts ?? null;
}

const key = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Junta trechos abertos (ways do litoral) pelas pontas em cadeias contínuas. Devolve as cadeias
 * da mais longa para a mais curta.
 */
export function assembleChains(ways: readonly LatLng[][]): LatLng[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const byEnd = new Map<string, number[]>();
  pool.forEach((w, i) => {
    for (const p of [w[0]!, w[w.length - 1]!]) {
      byEnd.set(key(p), [...(byEnd.get(key(p)) ?? []), i]);
    }
  });
  const used = new Set<number>();
  const chains: LatLng[][] = [];
  const take = (end: LatLng): number | undefined =>
    (byEnd.get(key(end)) ?? []).find((i) => !used.has(i));
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let chain = pool[i]!;
    for (;;) {
      const j = take(chain[chain.length - 1]!);
      if (j === undefined) break;
      used.add(j);
      const w = pool[j]!;
      chain = chain.concat(
        key(w[0]!) === key(chain[chain.length - 1]!)
          ? w.slice(1)
          : w.slice(0, -1).reverse(),
      );
    }
    for (;;) {
      const j = take(chain[0]!);
      if (j === undefined) break;
      used.add(j);
      const w = pool[j]!;
      chain = (
        key(w[w.length - 1]!) === key(chain[0]!)
          ? w.slice(0, -1)
          : w.slice(1).reverse()
      ).concat(chain);
    }
    chains.push(chain);
  }
  return chains.sort((a, b) => lengthM(b) - lengthM(a));
}

export interface Nearest {
  point: LatLng;
  /** Metros desde o início da linha até o ponto. */
  s: number;
  /** Distância do ponto consultado até `point`, em metros. */
  dist: number;
}

/** Ponto mais próximo de `p` sobre a linha, com a posição ao longo dela. */
export function nearestOnPolyline(p: LatLng, pts: readonly LatLng[]): Nearest {
  let best: Nearest = { point: pts[0]!, s: 0, dist: Infinity };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = distanceM(a, b);
    const pa = local(a, p);
    const pb = local(b, p);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, -(pa.x * dx + pa.y * dy) / len2));
    const dist = Math.hypot(pa.x + t * dx, pa.y + t * dy);
    if (dist < best.dist) {
      best = {
        point: {
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        },
        s: acc + seg * t,
        dist,
      };
    }
    acc += seg;
  }
  return best;
}

/** Ponto mais próximo de `p` entre todas as linhas da geometria (com o índice da linha). */
export function nearestOnGeometry(
  p: LatLng,
  g: Geometry,
): (Nearest & { line: number }) | null {
  let best: (Nearest & { line: number }) | null = null;
  g.lines.forEach((l, line) => {
    if (l.pts.length < 2) return;
    const n = nearestOnPolyline(p, l.pts);
    if (!best || n.dist < best.dist) best = { ...n, line };
  });
  return best;
}

/** Centro (média simples) de um conjunto de pontos. */
export function centroid(ps: readonly LatLng[]): LatLng {
  return {
    lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length,
    lng: ps.reduce((a, p) => a + p.lng, 0) / ps.length,
  };
}
