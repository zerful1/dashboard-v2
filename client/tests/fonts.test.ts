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

/**
 * Every way a page can fetch a font from another host: a CSS @import of a
 * remote stylesheet, an @font-face whose src is a remote URL, or a <link> that
 * loads a remote stylesheet or preloads a remote font. Any host, not just
 * Google's — rsms.me serves Inter itself, and Bunny and Typekit exist.
 */
function externalFontRefs(text: string): string[] {
  const patterns = [
    /@import\s+(?:url\()?\s*["']?https?:\/\/[^\s"')]+/gi,
    /@font-face\s*\{[^}]*url\(\s*["']?https?:\/\/[^\s"')]+/gi,
    /<link\b[^>]*\brel=["']?(?:stylesheet|preload)\b[^>]*\bhref=["']?https?:\/\/[^\s"'>]+/gi,
    /<link\b[^>]*\bhref=["']?https?:\/\/[^\s"'>]+[^>]*\brel=["']?(?:stylesheet|preload)\b/gi,
  ];
  return patterns.flatMap((p) => text.match(p) ?? []);
}

describe("fonts", () => {
  it("recognises a remote font however it is loaded, and not a bundled one", () => {
    for (const remote of [
      '@import url("https://rsms.me/inter/inter.css");',
      "@font-face { font-family: X; src: url(https://fonts.bunny.net/x.woff2); }",
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
      '<link href="https://use.typekit.net/abc.css" rel="stylesheet">',
      '<link rel="preload" href="https://example.com/f.woff2" as="font">',
    ]) {
      expect(externalFontRefs(remote), remote).not.toEqual([]);
    }
    for (const local of [
      'import "@fontsource-variable/inter";',
      "@font-face { font-family: X; src: url(./files/x.woff2); }",
      '<link rel="manifest" href="/manifest.webmanifest" />',
    ]) {
      expect(externalFontRefs(local), local).toEqual([]);
    }
  });

  // Offline first loads and no third-party requests: a font CDN breaks both.
  // The build config too: a plugin there could inject a <link> into the page.
  it("never loads a font from another host", () => {
    const sources = [...files(join(CLIENT, "src")), ...files(join(CLIENT, "public")), join(CLIENT, "rsbuild.config.ts")];
    const offenders = sources.filter((f) => externalFontRefs(readFileSync(f, "utf8")).length > 0);
    expect(offenders).toEqual([]);
  });

  // The positive complement: without it, a deleted import passes the test above.
  it("bundles Inter and puts it first in the sans stack", () => {
    expect(readFileSync(join(CLIENT, "src/index.tsx"), "utf8")).toContain('import "@fontsource-variable/inter";');
    expect(readFileSync(join(CLIENT, "src/styles.css"), "utf8")).toMatch(/--font-sans:\s*'Inter Variable'/);
  });
});
