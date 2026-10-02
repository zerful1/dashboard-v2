import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: { index: './src/index.tsx' },
  },
  // Without this RSBuild generates its own HTML and src/index.html is ignored,
  // so the tab read "Rsbuild App" — a title nobody chose, from a file nobody
  // knew was being discarded.
  html: {
    template: './src/index.html',
  },
  resolve: {
    alias: { '@': './src' },
  },
  server: {
    port: 5173,
    // Proxy /api to the Express server so the browser sees ONE origin in
    // development. Without this the client is on :5173 and the API on :3001 —
    // two origins — so the session cookie is cross-site and the browser drops
    // it, and nothing authenticated works locally however correct the server is.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  dev: {
    // RSBuild 2 compiles dynamic imports on first request by default
    // (lazyCompilation: { imports: true }). Every page here is React.lazy, and
    // under that default /gym could sit on the Suspense fallback indefinitely
    // while its chunk came back 200 through lazy-compilation-proxy. The built
    // client never did. Eager compilation costs a slower first start and is
    // dev-only: `rsbuild build` is unaffected.
    lazyCompilation: false,
  },
  output: {
    distPath: { root: 'dist' },
  },
});
