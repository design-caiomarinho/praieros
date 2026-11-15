// Gera as imagens de prévia do compartilhamento (`public/share/<slug>.jpg`, 1200×630, JPEG: o WhatsApp só mostra imagens leves): o pino da
// praia sobre o mapa, com a regra de produção (só pontos que o site mostra). Usa a página
// `/dev/share-render/<slug>` do `astro dev` e o Chrome ou Edge instalado (playwright-core, sem
// baixar navegador). A imagem não leva status nem data (só posição): regenerar quando o catálogo
// mudar, não a cada boletim. Acessa os tiles do OpenFreeMap (ver docs/decisions.md).
//   npm run share:images            todas as praias
//   npm run share:images -- <slug>  só a praia dada
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { loadSalvadorInputs, NOT_BEACHES } from '../src/lib/site/load-data.ts';
import { buildSiteModel } from '../src/lib/site/build-beach-models.ts';
import { toMarkers } from '../src/lib/site/map-markers.ts';

const PORT = 4399;
const ORIGIN = `http://localhost:${PORT}`;
const OUT = fileURLToPath(new URL('../public/share/', import.meta.url));

const inputs = await loadSalvadorInputs();
const site = buildSiteModel(inputs.bulletins, inputs.catalog, {
  includeUnverified: false,
  excluded: NOT_BEACHES,
  references: inputs.references,
  referenceExclude: inputs.referenceExclude,
  aliases: inputs.aliases,
  neighborhoodNames: inputs.neighborhoodNames,
});
const all = [...new Set(toMarkers(site.beaches).map((m) => m.slug))];
const only = process.argv.slice(2);
const slugs = only.length ? all.filter((s) => only.includes(s)) : all;
if (only.length && slugs.length !== only.length) {
  console.error(`Praia não encontrada em: ${only.join(', ')}`);
  process.exit(1);
}

const server = spawn(
  process.execPath,
  ['node_modules/astro/bin/astro.mjs', 'dev', '--port', String(PORT)],
  { stdio: 'ignore' },
);
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('O servidor de desenvolvimento não subiu.');
}

try {
  await waitForServer();
  await mkdir(OUT, { recursive: true });
  const browser = await chromium
    .launch({ channel: 'chrome' })
    .catch(() => chromium.launch({ channel: 'msedge' }));
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  let failed = 0;
  for (const slug of slugs) {
    try {
      await page.goto(`${ORIGIN}/dev/share-render/${slug}`);
      await page.waitForFunction('window.__shareReady === true', undefined, {
        timeout: 60_000,
      });
      await page
        .locator('#share-stage')
        .screenshot({ path: `${OUT}${slug}.jpg`, type: 'jpeg', quality: 85 });
      console.log(`ok   ${slug}`);
    } catch (error) {
      failed++;
      console.error(`ERRO ${slug}: ${(error as Error).message}`);
    }
  }
  await browser.close();
  if (failed) process.exitCode = 1;
} finally {
  stop();
}
