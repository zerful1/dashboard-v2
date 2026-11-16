import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// ZXing decoder served by this app, not a CDN; its file name carries zxing-wasm's version.
const require = createRequire(import.meta.url);
const fromPonyfill = createRequire(require.resolve('barcode-detector/ponyfill'));
const ZXING_WASM = fromPonyfill.resolve('zxing-wasm/reader/zxing_reader.wasm');
const ZXING_VERSION = (JSON.parse(readFileSync(join(dirname(ZXING_WASM), '..', '..', 'package.json'), 'utf8')) as { version: string }).version;

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: { index: './src/index.tsx' },
    // The version Settings shows; a local build has no commit and reads as "dev".
    define: {
      __BUILD_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
  },
  // Without this RSBuild ignores src/index.html and generates its own.
  html: {
    template: './src/index.html',
  },
  resolve: {
    alias: { '@': './src' },
  },
  server: {
    port: 5173,
    // Proxy /api so the browser sees ONE origin; cross-site, the session cookie is dropped.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  dev: {
    // Default lazy compilation left lazy pages on the Suspense fallback in dev; eager is dev only.
    lazyCompilation: false,
  },
  output: {
    distPath: { root: 'dist' },
    copy: [{ from: ZXING_WASM, to: `static/wasm/zxing_reader-${ZXING_VERSION}.wasm` }],
    // At /asset-manifest.json for lib/warmCache.ts; not "manifest.json", which reads as the web app manifest.
    manifest: 'asset-manifest.json',
  },
});
