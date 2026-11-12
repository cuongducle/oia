import { defineConfig } from 'astro/config';

// Pure static marketing site: no SSR adapter, no client framework.
// The whole contract is documented in apps/site/README.md.
export default defineConfig({
  output: 'static',
});
