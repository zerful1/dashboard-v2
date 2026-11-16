import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    // Node 25+ ships its own localStorage, which shadows jsdom's.
    execArgv: ["--no-experimental-webstorage"],
  },
  resolve: {
    // import.meta.dirname, not __dirname: this config is ESM ("type": "module"), where __dirname doesn't exist.
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
});
