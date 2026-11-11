/**
 * Salva em fixtures/ a página do Inema, o robots.txt e os PDFs das regiões.
 * Manual e raro: nunca roda no `npm test`. Acessa o site oficial uma vez.
 *
 *   npm run fixtures:save                  (acessa o site)
 *   npm run fixtures:save -- --from-html   (reusa a página salva; baixa só os PDFs)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  BULLETIN_PAGE_URL,
  REGION_LABELS,
  downloadRegionPdf,
  fetchBulletinPdfs,
  findRegionLinks,
  type RegionLabel,
} from '../src/lib/inema/fetch-bulletins.ts';

const DIR = new URL('../fixtures/', import.meta.url);
const FILES: Record<RegionLabel, string> = {
  SALVADOR: 'salvador.pdf',
  'BAÍA DE TODOS-OS-SANTOS': 'baia-de-todos-os-santos.pdf',
};

await mkdir(DIR, { recursive: true });
const fromHtml = process.argv.includes('--from-html');
let failed = false;

if (fromHtml) {
  const html = await readFile(
    new URL('qualidade-das-praias.html', DIR),
    'utf8',
  );
  const links = findRegionLinks(html);
  const opts = {
    fetchFn: fetch,
    pageUrl: BULLETIN_PAGE_URL,
    timeoutMs: 30_000,
    retries: 1,
    retryDelayMs: 1_000,
  };
  for (const label of REGION_LABELS) {
    const r = await downloadRegionPdf(label, links[label], opts);
    if (r.ok) {
      await writeFile(new URL(FILES[label], DIR), r.bytes);
      console.log(`OK   ${label}: ${r.url} (${r.bytes.length} bytes)`);
    } else {
      failed = true;
      console.error(`FALHA ${label}: ${r.reason}`);
    }
  }
} else {
  try {
    const robots = await fetch(new URL('/robots.txt', BULLETIN_PAGE_URL));
    await writeFile(new URL('robots.txt', DIR), await robots.text());
    console.log(`robots.txt: HTTP ${robots.status}`);
  } catch (err) {
    console.error(
      'robots.txt indisponível:',
      err instanceof Error ? err.message : err,
    );
  }
  const res = await fetchBulletinPdfs({ timeoutMs: 30_000 });
  if (!res.ok) {
    console.error(res.reason);
    process.exit(1);
  }
  await writeFile(new URL('qualidade-das-praias.html', DIR), res.html);
  for (const r of res.regions) {
    if (r.ok) {
      await writeFile(new URL(FILES[r.region], DIR), r.bytes);
      console.log(`OK   ${r.region}: ${r.url} (${r.bytes.length} bytes)`);
    } else {
      failed = true;
      console.error(`FALHA ${r.region}: ${r.reason}`);
    }
  }
}
process.exit(failed ? 1 : 0);
