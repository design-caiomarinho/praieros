// Busca UMA vez o limite administrativo de Salvador no OpenStreetMap (Overpass) e imprime
// o bounding box. Resultado em cache (data/catalog/.cache/); o valor final fica fixado em
// src/lib/map/salvador-bounds.ts. Uso raro: `node scripts/fetch-salvador-bounds.ts`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CACHE = new URL(
  '../data/catalog/.cache/salvador-bounds.json',
  import.meta.url,
);
const QUERY = `[out:json][timeout:60];
relation["boundary"="administrative"]["admin_level"="8"]["name"="Salvador"](-13.3,-38.9,-12.6,-38.2);
out bb;`;

interface Bounds {
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}

let data:
  | {
      elements: {
        id: number;
        tags?: Record<string, string>;
        bounds?: Bounds;
      }[];
    }
  | undefined;
try {
  data = JSON.parse(await readFile(CACHE, 'utf8'));
} catch {
  for (let i = 0; i < 3 && !data; i++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'praieros-catalog/0.1',
      },
      body: new URLSearchParams({ data: QUERY }),
    });
    if (res.ok) data = await res.json();
    else await new Promise((r) => setTimeout(r, 30_000));
  }
  if (!data) throw new Error('Overpass não respondeu; nada foi gravado.');
  await mkdir(new URL('./', CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(data));
}

for (const e of data?.elements ?? []) {
  console.log(e.id, e.tags?.name, JSON.stringify(e.bounds));
}
