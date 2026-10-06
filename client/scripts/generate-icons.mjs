import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Rasterises the PWA icons from `client/public/favicon.svg`.
 *
 * The SVG is the single source of the mark, so nothing here is upscaled — sharp
 * renders the vector at each target size. Run it again after editing the SVG:
 *
 *   node client/scripts/generate-icons.mjs
 *
 * The PNGs are committed, so a later `sharp` install failure cannot break a
 * build. It is a devDependency and never reaches the bundle.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../public");

const SOURCE = readFileSync(resolve(PUBLIC, "favicon.svg"), "utf8");

/** The tile colour: the page's black. */
const TILE = "#000000";

/**
 * The mark alone — the source with its svg wrapper and its tile rect removed.
 * Taken from the SVG rather than restated, so editing the artwork cannot leave
 * the PNGs drawing a previous version of it.
 */
const MARK = SOURCE.replace(/<svg[^>]*>/, "")
  .replace("</svg>", "")
  .replace(/\s*<rect[^>]*><\/rect>/, "")
  .trim();

/**
 * Every PNG is FULL-BLEED black: no corner radius, no edge. iOS and Android
 * apply their own masks, and a pre-rounded tile would show the wallpaper in
 * the gap between our corners and theirs (redesign spec §6).
 *
 * `scale` shrinks the mark about the centre. Only maskable needs it: the
 * guaranteed-visible area is a circle of radius 40%, and the mark's dot edge
 * sits sqrt(8.5² + 5.5²) + 2.9 = 13.0 units from centre — 40.7% of 32, just
 * outside. At 0.8 it is 32.5%.
 */
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
