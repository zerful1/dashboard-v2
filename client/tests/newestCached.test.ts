import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { newestCached } from "../src/lib/newestCached";

describe("newestCached", () => {
  it("returns the newest day's answer, whatever order the cache holds them in", () => {
    const qc = new QueryClient();
    qc.setQueryData(["liftProgress", "u1", "2026-10-05"], "Monday's");
    qc.setQueryData(["liftProgress", "u1", "2026-10-03"], "Saturday's");
    qc.setQueryData(["liftProgress", "u1", "2026-10-04"], "Sunday's");
    expect(newestCached(qc, ["liftProgress", "u1"])).toBe("Monday's");
  });

  it("skips a day with no answer, and stays inside its prefix", () => {
    const qc = new QueryClient();
    qc.setQueryData(["liftProgress", "u1", "2026-10-04"], "Sunday's");
    qc.getQueryCache().build(qc, { queryKey: ["liftProgress", "u1", "2026-10-05"] });
    qc.setQueryData(["liftProgress", "u2", "2026-10-06"], "someone else's");
    expect(newestCached(qc, ["liftProgress", "u1"])).toBe("Sunday's");
    expect(newestCached(qc, ["liftProgress", "u3"])).toBeUndefined();
  });
});
