import { describe, it, expect, vi, afterEach } from "vitest";
import { gunzipSync } from "node:zlib";
import { RESTORED_TABLES, RESTORE_MAX_BYTES, type RestoreCounts } from "@dashboard/shared";
import {
  REQUEST_CAP_BYTES,
  TOO_LARGE,
  cantSend,
  missingParts,
  packBody,
  readDownload,
  total,
} from "../src/features/settings/restoreFile";

const zero = Object.fromEntries(RESTORED_TABLES.map((t) => [t, 0])) as RestoreCounts;
const file = (text: string) => new File([text], "download.json", { type: "application/json" });
const DOWNLOAD = JSON.stringify({ format: "dashboard-export", version: 1, tables: {} });

afterEach(() => vi.unstubAllGlobals());

describe("readDownload", () => {
  const NOT_A_DOWNLOAD = { refused: "This isn't a dashboard download" };

  it("refuses a file that isn't JSON", async () => {
    expect(await readDownload(file("not json {"))).toEqual(NOT_A_DOWNLOAD);
  });

  it("refuses JSON that isn't a download", async () => {
    expect(await readDownload(file(JSON.stringify({ format: "x" })))).toEqual(NOT_A_DOWNLOAD);
    expect(await readDownload(file("null"))).toEqual(NOT_A_DOWNLOAD);
  });

  it("is the text for a download", async () => {
    expect(await readDownload(file(DOWNLOAD))).toEqual({ text: DOWNLOAD });
  });

  it("refuses a file over the server's limit without reading it", async () => {
    const big = file(DOWNLOAD);
    Object.defineProperty(big, "size", { value: RESTORE_MAX_BYTES + 1 });
    const text = vi.spyOn(big, "text");
    expect(await readDownload(big)).toEqual({ refused: TOO_LARGE });
    expect(text).not.toHaveBeenCalled();
  });
});

describe("packBody", () => {
  it("gzips the text when the browser can", async () => {
    const packed = await packBody(DOWNLOAD);
    expect(packed.gzipped).toBe(true);
    const bytes = Buffer.from(await new Response(packed.body).arrayBuffer());
    expect(gunzipSync(bytes).toString("utf8")).toBe(DOWNLOAD);
    expect(packed.bytes).toBe(bytes.length);
  });

  it("sends it plain when it can't, counting bytes rather than characters", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    expect(await packBody(DOWNLOAD)).toEqual({ body: DOWNLOAD, gzipped: false, bytes: DOWNLOAD.length });
    expect((await packBody('"é"')).bytes).toBe(4);
  });
});

describe("cantSend", () => {
  it("lets a body up to Vercel's cap go", () => {
    expect(cantSend({ body: "", gzipped: false, bytes: REQUEST_CAP_BYTES })).toBeNull();
  });

  // Gzip would have put it under the cap, so the browser is what to change.
  it("blames the browser for a plain body over it", () => {
    expect(cantSend({ body: "", gzipped: false, bytes: REQUEST_CAP_BYTES + 1 })).toBe(
      "This browser can't send a file this large. Try an up-to-date browser.",
    );
  });

  it("calls a gzipped body over it too large", () => {
    expect(cantSend({ body: "", gzipped: true, bytes: REQUEST_CAP_BYTES + 1 })).toBe(TOO_LARGE);
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
