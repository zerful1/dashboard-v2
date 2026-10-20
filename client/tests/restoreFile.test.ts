import { describe, it, expect, vi, afterEach } from "vitest";
import { gunzipSync } from "node:zlib";
import { RESTORED_TABLES, type RestoreCounts } from "@dashboard/shared";
import { missingParts, packBody, readDownload, total } from "../src/features/settings/restoreFile";

const zero = Object.fromEntries(RESTORED_TABLES.map((t) => [t, 0])) as RestoreCounts;
const file = (text: string) => new File([text], "download.json", { type: "application/json" });
const DOWNLOAD = JSON.stringify({ format: "dashboard-export", version: 1, tables: {} });

afterEach(() => vi.unstubAllGlobals());

describe("readDownload", () => {
  it("is null for a file that isn't JSON", async () => {
    expect(await readDownload(file("not json {"))).toBeNull();
  });

  it("is null for JSON that isn't a download", async () => {
    expect(await readDownload(file(JSON.stringify({ format: "x" })))).toBeNull();
    expect(await readDownload(file("null"))).toBeNull();
  });

  it("is the text for a download", async () => {
    expect(await readDownload(file(DOWNLOAD))).toBe(DOWNLOAD);
  });
});

describe("packBody", () => {
  it("gzips the text when the browser can", async () => {
    const packed = await packBody(DOWNLOAD);
    expect(packed.gzipped).toBe(true);
    const bytes = Buffer.from(await new Response(packed.body).arrayBuffer());
    expect(gunzipSync(bytes).toString("utf8")).toBe(DOWNLOAD);
  });

  it("sends it plain when it can't", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    expect(await packBody(DOWNLOAD)).toEqual({ body: DOWNLOAD, gzipped: false });
  });
});

describe("missingParts", () => {
  it("names what's missing in the sheet's order, leaving out zeros", () => {
    expect(missingParts({ ...zero, body_weight: 2, workout_sessions: 1, workout_sets: 18, habits: 1, habit_completions: 14 })).toEqual([
      "Weigh-ins 2",
      "Gym sessions 1",
      "18 sets",
      "Habits 1",
      "14 ticks",
    ]);
  });

  it("names every restored table, in the singular for one", () => {
    const one = Object.fromEntries(RESTORED_TABLES.map((t) => [t, 1])) as RestoreCounts;
    expect(missingParts(one)).toEqual([
      "Weigh-ins 1",
      "Gym sessions 1",
      "1 set",
      "1 cardio entry",
      "Foods 1",
      "1 food entry",
      "Targets 1",
      "Goals 1",
      "Habits 1",
      "1 tick",
    ]);
  });

  it("is empty when nothing is missing", () => {
    expect(missingParts(zero)).toEqual([]);
    expect(total(zero)).toBe(0);
  });

  it("totals every table", () => {
    expect(total({ ...zero, body_weight: 2, workout_sets: 18 })).toBe(20);
  });
});
