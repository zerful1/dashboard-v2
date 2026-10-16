import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// The barcode scanner's ZXing decoder (barcodeDetector.ts), served by this app
// rather than a CDN (spec: no third-party fetch at scan time). The file name
// carries zxing-wasm's version, which is also the ponyfill's ZXING_WASM_VERSION,
// so the service worker's cache-first /static/ rule can keep it for good.
const require = createRequire(import.meta.url);
const ZXING_WASM = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
const ZXING_VERSION = (JSON.parse(readFileSync(join(dirname(ZXING_WASM), '..', '..', 'package.json'), 'utf8')) as { version: string }).version;

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: { index: './src/index.tsx' },
    // The version Settings shows (lib/buildInfo.ts). Vercel sets the commit at
    // build time; a local build has none and reads as "dev".
    define: {
      __BUILD_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
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
    copy: [{ from: ZXING_WASM, to: `static/wasm/zxing_reader-${ZXING_VERSION}.wasm` }],
  },
});
