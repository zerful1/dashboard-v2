import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clientPath } from "./clientRoot";

/** The pages are static files Vercel serves, never through Express/helmet. */
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
    // camera=() would switch the scanner off on every device, and no test that mocks getUserMedia would notice.
    expect(headersFor("/nutrition")["permissions-policy"]).toContain("camera=(self)");
  });

  it("sets no policy the app can't yet meet", () => {
    // Inline style attributes and the WebAssembly decoder mean script-src.
    const csp = headersFor("/")["content-security-policy"]!;
    for (const directive of ["default-src", "script-src", "style-src"]) expect(csp).not.toContain(directive);
  });
});
