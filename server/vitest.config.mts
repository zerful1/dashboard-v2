import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Every suite shares one test schema, so parallel truncation would make
    // results non-deterministic.
    fileParallelism: false,
    // argon2id is deliberately slow; a suite that hashes several passwords needs
    // more than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DB_SCHEMA: "app_test",
    },
  },
});
