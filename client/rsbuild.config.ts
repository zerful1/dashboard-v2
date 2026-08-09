import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  source: {
    entry: { index: './src/index.tsx' },
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
  output: {
    distPath: { root: 'dist' },
  },
});
