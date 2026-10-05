import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { clientPath } from "./clientRoot";

const CLIENT = clientPath(".");
const TEXT = /\.(tsx?|css|html|js|mjs|json|webmanifest|svg)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : TEXT.test(name) ? [path] : [];
  });
}

describe("fonts (redesign spec §4)", () => {
  // Offline first loads and no third-party requests: a font CDN breaks both.
  it("never loads a font from a third-party host", () => {
    const offenders = [...files(join(CLIENT, "src")), ...files(join(CLIENT, "public"))].filter((f) =>
      /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  // The positive complement: without it, a deleted import passes the test above.
  it("bundles Inter and puts it first in the sans stack", () => {
    expect(readFileSync(join(CLIENT, "src/index.tsx"), "utf8")).toContain('import "@fontsource-variable/inter";');
    expect(readFileSync(join(CLIENT, "src/styles.css"), "utf8")).toMatch(/--font-sans:\s*'Inter Variable'/);
  });
});
