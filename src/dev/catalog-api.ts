// Endpoints de desenvolvimento da revisão do catálogo. Registrados só em `astro dev`
// (astro.config.mjs); nunca entram no build. Não faz commit: só atualiza o arquivo.
import type { APIRoute } from 'astro';
import { fileURLToPath } from 'node:url';
import {
  readCatalogFile,
  writeCatalogFile,
} from '../lib/catalog/catalog-file.ts';
import { applyAction, parseAction } from '../lib/catalog/review.ts';
import { reverseNeighborhood } from './reverse-geocode.ts';

export const prerender = false;

const CATALOG = fileURLToPath(
  new URL('../../data/catalog/salvador.json', import.meta.url),
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const today = () => new Date().toISOString().slice(0, 10);

// Uma gravação por vez: leitura, validação e troca do arquivo não se misturam.
let queue: Promise<unknown> = Promise.resolve();
const exclusive = <T>(fn: () => Promise<T>) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

/** POST /dev/api/catalog: aplica uma ação, valida e grava. Devolve o catálogo novo. */
export const POST: APIRoute = async ({ request }) => {
  let action;
  try {
    action = parseAction(await request.json());
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }
  if (typeof action === 'string') return json({ error: action }, 400);
  return exclusive(async () => {
    const prev = await readCatalogFile(CATALOG);
    const result = applyAction(prev, action, today());
    if (!result.ok) return json({ error: result.error }, 422);
    const errors = await writeCatalogFile(CATALOG, prev, result.catalog);
    if (errors.length > 0) return json({ error: errors.join(' ') }, 422);
    return json({ catalog: result.catalog });
  });
};

/** GET /dev/api/catalog?lat=&lng=: sugestão de bairro (consulta inversa do OSM, com cache). */
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'lat e lng inválidos.' }, 400);
  }
  try {
    return json({ suggestion: await reverseNeighborhood(lat, lng, today()) });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};
