import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(clientPath(path));
  expect(b.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("icons and metadata (redesign spec §6)", () => {
  it("ships every icon at the size it is declared at", () => {
    expect(pngSize("public/apple-touch-icon.png")).toEqual([180, 180]);
    expect(pngSize("public/icon-192.png")).toEqual([192, 192]);
    expect(pngSize("public/icon-512.png")).toEqual([512, 512]);
    expect(pngSize("public/icon-maskable-512.png")).toEqual([512, 512]);
  });

  it("points the page at the Apple icon, with a black theme colour", () => {
    const html = readFileSync(clientPath("src/index.html"), "utf8");
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="theme-color" content="#000000" />');
  });

  it("lists the manifest icons and black colours", () => {
    const m = JSON.parse(readFileSync(clientPath("public/manifest.webmanifest"), "utf8"));
    expect(m.theme_color).toBe("#000000");
    expect(m.background_color).toBe("#000000");
    expect(m.icons.map((i: { src: string; sizes: string; purpose: string }) => `${i.src} ${i.sizes} ${i.purpose}`)).toEqual([
      "/icon-192.png 192x192 any",
      "/icon-512.png 512x512 any",
      "/icon-maskable-512.png 512x512 maskable",
    ]);
  });

  it("draws the trend-line mark in the favicon", () => {
    const svg = readFileSync(clientPath("public/favicon.svg"), "utf8");
    expect(svg).toContain('points="7,22 12.5,16.5 17,19 24.5,10.5"');
    expect(svg).not.toMatch(/#E07A5F|#1C1917/i);
  });
});
