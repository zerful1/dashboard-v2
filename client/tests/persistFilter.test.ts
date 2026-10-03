import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { shouldPersistQuery } from "../src/lib/persistFilter";

describe("shouldPersistQuery", () => {
  it("keeps ordinary queries and drops those that opt out", async () => {
    const qc = new QueryClient();
    await qc.fetchQuery({ queryKey: ["kept"], queryFn: async () => 1 });
    await qc.fetchQuery({ queryKey: ["dropped"], queryFn: async () => 1, meta: { persist: false } });
    // Positive complement first: an unfiltered persister would pass the negative alone.
    expect(shouldPersistQuery(qc.getQueryCache().find({ queryKey: ["kept"] })!)).toBe(true);
    expect(shouldPersistQuery(qc.getQueryCache().find({ queryKey: ["dropped"] })!)).toBe(false);
  });
});
