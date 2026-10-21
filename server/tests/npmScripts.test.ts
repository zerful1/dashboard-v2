import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A script pointing tsx at a deleted file passes the typecheck and fails only
 * when someone runs it, which for a one-off tool can be months later. Retiring
 * v1 (housekeeping 5) deleted six such files and their four scripts.
 */
describe("npm scripts", () => {
  it.each([
    ["the root", resolve(__dirname, "../..")],
    ["the server", resolve(__dirname, "..")],
  ])("in %s package.json point tsx at files that exist", (_, dir) => {
    const { scripts } = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const targets = Object.entries(scripts).flatMap(([name, cmd]) =>
      // `tsx`, then `watch` or any flags, then the file.
      [...cmd.matchAll(/\btsx(?:\s+(?:watch|-\S+))*\s+(\S+\.[cm]?[jt]s)\b/g)].map((m) => ({ name, path: m[1]! })),
    );
    expect(targets.length).toBeGreaterThan(0);
    const missing = targets.filter((t) => !existsSync(resolve(dir, t.path))).map((t) => t.name);
    expect(missing).toEqual([]);
  });
});
