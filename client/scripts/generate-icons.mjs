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

/** The tile colour, from the SVG's own background rect. */
const TILE = "#1C1917";

/**
 * The mark alone — the source with its rounded background rect removed.
 *
 * Taken from the SVG rather than restated here, so editing the artwork cannot
 * leave the maskable icon drawing a previous version of it.
 */
const MARK = SOURCE.replace(/\s*<rect width="32" height="32"[^>]*><\/rect>/, "");

/**
 * Normal icons: the artwork as-is, rounded corners included.
 *
 * `any` purpose icons are shown as drawn, so the rx="7.5" tile is what the
 * platform displays and the mark keeps its natural 56.25% of the canvas.
 */
function plain(size) {
  return SOURCE.replace('width="32" height="32"', `width="${size}" height="${size}"`);
}

/**
 * Maskable: background bled to all four edges, mark shrunk to 50%.
 *
 * Two separate requirements, both mandatory and neither cosmetic:
 *
 * 1. NO corner radius. Android applies its own mask — circle, squircle,
 *    teardrop, whatever the launcher uses — so a pre-rounded tile shows the
 *    page colour in the gap between our corners and theirs.
 * 2. The mark at ~50%, not its natural 56.25%. Only the centre 80% of a
 *    maskable icon is guaranteed visible, i.e. a safe circle of radius 40%.
 *    At natural size the outer squares' far corners sit at
 *    sqrt(9^2 + 9^2) / 32 = 39.8% from centre — inside 40% by a fifth of a
 *    percent, which is not a margin. At 50% they sit at 35.4%.
 */
function maskable(size) {
  // 50 / 56.25: shrink the mark from its natural share of the canvas to the
  // share that survives a circular crop. Scaled about the centre, not the
  // origin, or it would drift up and left.
  const scale = 50 / 56.25;
  const inner = MARK.replace(/<svg[^>]*>/, "").replace("</svg>", "").trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${TILE}"></rect>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -16)">
    ${inner}
  </g>
</svg>`;
}

const TARGETS = [
  ["icon-192.png", plain(192), 192],
  ["icon-512.png", plain(512), 512],
  ["icon-maskable-512.png", maskable(512), 512],
];

for (const [name, svg, size] of TARGETS) {
  const out = resolve(PUBLIC, name);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`wrote ${name} (${size}x${size})`);
}
