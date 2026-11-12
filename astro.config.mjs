// @ts-check
import { defineConfig } from 'astro/config';

// Páginas e endpoints de desenvolvimento: só existem no `astro dev`, nunca no build (docs/decisions.md).
/** @type {import('astro').AstroIntegration} */
const devPages = {
  name: 'dev-pages',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') {
        injectRoute({
          pattern: '/dev/components',
          entrypoint: './src/dev/components.astro',
        });
        injectRoute({
          pattern: '/dev/catalog-review',
          entrypoint: './src/dev/catalog-review.astro',
        });
        injectRoute({
          pattern: '/dev/catalog-overview',
          entrypoint: './src/dev/catalog-overview.astro',
        });
        injectRoute({
          pattern: '/dev/api/catalog',
          entrypoint: './src/dev/catalog-api.ts',
        });
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // GitHub Pages do repositório (https://design-caiomarinho.github.io/praieros/): o prefixo só vale
  // no build do GitHub Actions; em desenvolvimento e em build local o site continua na raiz.
  site: 'https://design-caiomarinho.github.io',
  base: process.env.GITHUB_ACTIONS ? '/praieros' : '/',
  integrations: [devPages],
  vite: {
    // MapLibre 6 acha o worker pelo próprio caminho; o pré-empacotamento do Vite o quebra.
    optimizeDeps: { exclude: ['maplibre-gl'] },
  },
});
