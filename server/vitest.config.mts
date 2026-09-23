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
      // Sign-ups are closed by default, and nearly every suite registers users.
      // The closed and listed policies are tested by handing one to createApp
      // (tests/signups.test.ts), so the default here is open.
      SIGNUP_ALLOWLIST: "*",
    },
  },
});
