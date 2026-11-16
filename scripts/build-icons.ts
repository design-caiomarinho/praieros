// Gera os ícones do site a partir do símbolo da onda do logo (`src/assets/logo.svg`):
// public/favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png, icon-192.png, icon-512.png
// e site.webmanifest. Usa o Chrome ou Edge instalado (playwright-core, como `share:images`).
//   npm run icons:build
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { symbolSvg, buildIco, buildManifest } from '../src/lib/seo/icons.ts';
import { resolveColor } from '../src/lib/seo/colors.ts';

const tokens = JSON.parse(readFileSync('tokens/tokens.json', 'utf8'));
// Fundo dos ícones opacos e do manifest: o fundo padrão do site (color.surface.default).
const surface = resolveColor(tokens, 'color.surface.default');

const logo = readFileSync('src/assets/logo.svg', 'utf8');
const symbol = symbolSvg(logo);
writeFileSync('public/favicon.svg', symbol);

const browser = await chromium
  .launch({ channel: 'chrome' })
  .catch(() => chromium.launch({ channel: 'msedge' }));

/** PNG do símbolo em `size` px; com `background`, o símbolo ocupa `fill` do lado (margem em volta). */
async function png(size: number, opts: { background?: string; fill?: number }) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const inner = Math.round(size * (opts.fill ?? 1));
  await page.setContent(
    `<style>html,body{margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;${
      opts.background ? `background:${opts.background};` : ''
    }}svg{width:${inner}px;height:${inner}px;display:block}</style>${symbol}`,
  );
  const buf = await page.screenshot({
    type: 'png',
    omitBackground: !opts.background,
  });
  await page.close();
  return buf;
}

const ico = buildIco(
  await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, png: await png(size, {}) })),
  ),
);
writeFileSync('public/favicon.ico', ico);
// iOS preenche a transparência com preto: o apple-touch-icon leva fundo e margem.
writeFileSync(
  'public/apple-touch-icon.png',
  await png(180, { background: surface, fill: 0.7 }),
);
writeFileSync('public/icon-192.png', await png(192, { fill: 0.9 }));
writeFileSync('public/icon-512.png', await png(512, { fill: 0.9 }));
writeFileSync(
  'public/site.webmanifest',
  buildManifest({ themeColor: surface, backgroundColor: surface }),
);
await browser.close();
console.log(
  'Ícones gerados em public/ (favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest).',
);
