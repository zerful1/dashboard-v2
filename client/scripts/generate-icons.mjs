import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** Rasterises the PWA icons from favicon.svg (`node client/scripts/generate-icons.mjs`); the PNGs are committed. */

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../public");

const SOURCE = readFileSync(resolve(PUBLIC, "favicon.svg"), "utf8");

/** The tile colour: the page's black. */
const TILE = "#000000";

/** The mark alone (svg wrapper and tile rect removed), taken from the SVG so the PNGs can't go stale. */
const MARK = SOURCE.replace(/<svg[^>]*>/, "")
  .replace("</svg>", "")
  .replace(/\s*<rect[^>]*><\/rect>/, "")
  .trim();

/** Full-bleed black tiles (iOS and Android mask them); `scale` shrinks the mark to fit maskable's 40% circle. */
function tile(size, scale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${TILE}"></rect>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">
    ${MARK}
  </g>
</svg>`;
}

const TARGETS = [
  ["apple-touch-icon.png", tile(180, 1), 180],
  ["icon-192.png", tile(192, 1), 192],
  ["icon-512.png", tile(512, 1), 512],
  ["icon-maskable-512.png", tile(512, 0.8), 512],
];

for (const [name, svg, size] of TARGETS) {
  const out = resolve(PUBLIC, name);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`wrote ${name} (${size}x${size})`);
}
