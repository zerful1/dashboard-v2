/** The four retail formats on food packets. */
export const FOOD_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

export interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * The browser's own BarcodeDetector when it reads all four formats (Android
 * Chrome); otherwise ZXing compiled to WebAssembly (iPhone, desktop). The
 * fallback loads only here, on the first scan, and its .wasm is this app's own
 * file - rsbuild.config.ts copies it under /static/wasm - never a CDN's (spec §3).
 */
export async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[]);
    if (FOOD_FORMATS.every((f) => supported.includes(f))) return new native({ formats: [...FOOD_FORMATS] });
  }
  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/static/wasm/zxing_reader-${ZXING_WASM_VERSION}.wasm` : prefix + path,
    },
  });
  return new BarcodeDetector({ formats: [...FOOD_FORMATS] }) as unknown as Detector;
}
