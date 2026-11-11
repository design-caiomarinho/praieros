// @ts-check
import { defineConfig } from 'astro/config';

// Página de componentes: só existe no `astro dev`, nunca no build (docs/decisions.md).
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
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({ integrations: [devPages] });
