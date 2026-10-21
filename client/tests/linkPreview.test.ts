import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { clientPath } from "./clientRoot";

const HTML = readFileSync(clientPath("src/index.html"), "utf8");

/** A meta tag's content, by its property (og:*) or name (description, twitter:*). */
function meta(key: string): string | undefined {
  const tag = HTML.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`));
  return tag?.[1];
}

/**
 * The card a shared link shows (sign-in redesign). A crawler never runs the
 * app, so these tags are all it reads, and nothing fails visibly when the
 * picture is renamed or redrawn at another size: the card just goes blank or
 * cropped on LinkedIn.
 */
describe("the link preview", () => {
  it("names a picture that is in public/, at the size it declares", () => {
    const image = new URL(meta("og:image")!);
    const file = clientPath(`public${image.pathname}`);
    expect(existsSync(file)).toBe(true);
    // A PNG's width and height are the first two numbers of its IHDR chunk.
    const png = readFileSync(file);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(String(png.readUInt32BE(16))).toBe(meta("og:image:width"));
    expect(String(png.readUInt32BE(20))).toBe(meta("og:image:height"));
  });

  // Crawlers don't resolve a relative og:image against the page.
  it("gives the picture and the page absolute https addresses on one domain", () => {
    const image = new URL(meta("og:image")!);
    const page = new URL(meta("og:url")!);
    expect(image.protocol).toBe("https:");
    expect(image.origin).toBe(page.origin);
  });

  it("describes the app the way the sign-in heading does", () => {
    expect(meta("og:title")).toBe("Dashboard");
    expect(meta("og:description")).toBe("Track your training, food and habits.");
    expect(meta("description")).toBe(meta("og:description"));
    expect(meta("twitter:card")).toBe("summary_large_image");
  });
});
