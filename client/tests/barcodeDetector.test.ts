import { describe, it, expect, vi, afterEach } from "vitest";

const ponyfill = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(),
  constructed: [] as unknown[],
}));
vi.mock("barcode-detector/ponyfill", () => ({
  ZXING_WASM_VERSION: "9.9.9",
  prepareZXingModule: ponyfill.prepareZXingModule,
  BarcodeDetector: class {
    constructor(o: unknown) {
      ponyfill.constructed.push(o);
    }
    async detect() {
      return [];
    }
  },
}));

import { createDetector, FOOD_FORMATS } from "../src/features/nutrition/barcodeDetector";

const g = globalThis as { BarcodeDetector?: unknown };
afterEach(() => {
  delete g.BarcodeDetector;
  ponyfill.prepareZXingModule.mockClear();
  ponyfill.constructed.length = 0;
});

describe("createDetector", () => {
  it("uses the browser's own detector when it reads every food format", async () => {
    class Native {
      static async getSupportedFormats() {
        return ["qr_code", ...FOOD_FORMATS];
      }
      async detect() {
        return [];
      }
    }
    g.BarcodeDetector = Native;
    expect(await createDetector()).toBeInstanceOf(Native);
    expect(ponyfill.prepareZXingModule).not.toHaveBeenCalled();
  });

  // The fallback's .wasm is this app's own file, never a CDN's.
  it("falls back to ZXing, served from this app, when the browser lacks a format or a detector", async () => {
    class Partial {
      static async getSupportedFormats() {
        return ["ean_13"];
      }
    }
    g.BarcodeDetector = Partial;
    await createDetector();
    expect(ponyfill.constructed).toEqual([{ formats: [...FOOD_FORMATS] }]);
    const { locateFile } = ponyfill.prepareZXingModule.mock.calls[0]![0].overrides;
    expect(locateFile("zxing_reader.wasm", "https://fastly.jsdelivr.net/npm/zxing-wasm/dist/reader/"))
      .toBe("/static/wasm/zxing_reader-9.9.9.wasm");
    expect(locateFile("other.js", "/p/")).toBe("/p/other.js");
  });
});
