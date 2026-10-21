import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Deliberately NOT pinning TZ.
    //
    // TZ: 'Europe/London' would be belt-and-braces, but the suite was
    // verified to pass unchanged under Pacific/Auckland (+12), America/Anchorage (-9)
    // and UTC — no test reads the process timezone. Pinning it now would be actively
    // harmful: a future test that *did* depend on local time would pass on every
    // machine and in CI, hiding exactly the class of bug this rework removed.
    //
    // Leaving it unset means a dev box on Europe/London and a UTC CI runner disagree,
    // and the dependency surfaces immediately.
  },
});
