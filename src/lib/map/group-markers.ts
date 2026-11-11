import type { MarkerData } from '../site/map-markers.ts';
import { centerOf } from './spread.ts';

export interface BeachGroup {
  slug: string;
  beachName: string;
  /** Centro dos pontos (posição do marcador agrupado). */
  center: { lat: number; lng: number };
  points: MarkerData[];
}

/** Agrupa por praia (nunca por proximidade), na ordem do primeiro ponto de cada uma. */
export function groupBySlug(markers: readonly MarkerData[]): BeachGroup[] {
  const by = new Map<string, MarkerData[]>();
  for (const m of markers) {
    const list = by.get(m.slug);
    if (list) list.push(m);
    else by.set(m.slug, [m]);
  }
  return [...by.entries()].map(([slug, points]) => ({
    slug,
    beachName: points[0].beachName,
    center: centerOf(points),
    points,
  }));
}
