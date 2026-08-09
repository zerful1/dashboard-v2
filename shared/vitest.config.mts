import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Belt-and-braces only. After the date rework no domain function reads the
    // process timezone, so any test that *needs* this is a hidden dependency to
    // hunt down. Set here rather than in the npm script: `TZ=... vitest` works in
    // Git Bash but not cmd.exe.
    env: { TZ: "Europe/London" },
  },
});
