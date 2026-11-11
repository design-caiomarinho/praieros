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
          pattern: '/dev/api/catalog',
          entrypoint: './src/dev/catalog-api.ts',
        });
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  integrations: [devPages],
  vite: {
    // MapLibre 6 acha o worker pelo próprio caminho; o pré-empacotamento do Vite o quebra.
    optimizeDeps: { exclude: ['maplibre-gl'] },
  },
});
