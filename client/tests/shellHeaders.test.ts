import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clientPath } from "./clientRoot";

/**
 * The app's pages are static files Vercel serves itself: Express, and so
 * helmet, only ever answers /api (server/tests/headers.test.ts). Until these
 * were set in vercel.json the HTML went out with no security headers at all,
 * so any site could frame the app, and nothing said so.
 *
 * A config check, not a request: nothing local serves vercel.json. After a
 * deploy, `curl -I` on the site is the proof.
 */
const vercel = JSON.parse(readFileSync(resolve(clientPath(".."), "vercel.json"), "utf8")) as {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};

/** The headers a path is served with, lower-cased by name. */
function headersFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of vercel.headers ?? []) {
    if (!new RegExp(`^${rule.source}$`).test(path)) continue;
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

describe("the app shell's headers", () => {
  it.each(["/", "/login", "/gym", "/reset-password", "/static/js/index.abc.js"])("covers %s", (path) => {
    const h = headersFor(path);
    expect(h["x-content-type-options"]).toBe("nosniff");
    // Clickjacking: the app is never meant to be embedded, by anyone.
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    // /reset-password carries its token in the address.
    expect(h["referrer-policy"]).toBe("no-referrer");
  });

  it("leaves /api to helmet", () => {
    expect(headersFor("/api/weight")).toEqual({});
  });

  it("still lets the barcode scanner use the camera", () => {
    // camera=() here would switch the scanner off on every device, and no
    // test that mocks getUserMedia would notice.
    expect(headersFor("/nutrition")["permissions-policy"]).toContain("camera=(self)");
  });

  it("sets no policy the app can't yet meet", () => {
    // The app uses inline style attributes (Motion, Recharts) and loads a
    // WebAssembly decoder (CLAUDE.md), so a script-src, style-src or
    // default-src needs its own pass against the built client. Until then the
    // policy holds only directives that restrict none of that.
    const csp = headersFor("/")["content-security-policy"]!;
    for (const directive of ["default-src", "script-src", "style-src"]) expect(csp).not.toContain(directive);
  });
});
