import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    // import.meta.dirname, NOT __dirname — client/package.json sets
    // "type": "module", so this file is ESM and __dirname does not exist.
    // The config would crash on load before a single test ran.
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
});
