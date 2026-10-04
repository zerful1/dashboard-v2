import type { FoodHit } from "@dashboard/shared";

export const OFF_SEARCH_URL = "https://search.openfoodfacts.org/search";
export const OFF_TIMEOUT_MS = 4000;

const UK_CLAUSE = 'countries_tags:"en:united-kingdom"';
/** Below this many UK-tagged hits, an unfiltered query tops the results up. */
const MIN_UK_HITS = 5;
// Open Food Facts asks every API client to identify itself.
const USER_AGENT = "dashboard-v2/1.0 (personal nutrition tracker)";

export interface OffProduct {
  code?: string | number;
  product_name?: string;
  /** Search-a-licious sends an array; the v2 product endpoint sends a string. */
  brands?: string | string[];
  nutriments?: Record<string, unknown>;
}

/** One display string from either shape of `brands`, or undefined when there is none. */
function brandOf(brands: OffProduct["brands"]): string | undefined {
  const s = Array.isArray(brands) ? brands.filter(Boolean).join(", ") : brands;
  return s || undefined;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// The diary POST's limits (routes/nutrition.ts foodBody): a hit beyond them
// could never be logged, so it is trimmed or left out here (#17 review 4).
const MAX_NAME = 200;
const MAX_EXTERNAL_ID = 100;

/** A nutrient amount, or null when missing, unreadable or negative: unknown, never zero. */
const amount = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n < 0 ? null : n;
};

// Physical ceilings per 100 g: nothing holds more than 100 g of a nutrient in
// 100 g, or much more energy than fat's 900 kcal. Real entries break both
// (59,000 kcal; 112 g of carbohydrate), and the diary POST refuses some of them
// outright. Impossible core values leave the hit out; impossible label values
// become unknown (final review).
const MAX_KCAL_PER_100G = 1000;
const MAX_GRAMS_PER_100G = 100;

/** A label nutrient, or null when it is missing, negative or impossible. */
const label = (v: unknown): number | null => {
  const n = amount(v);
  return n === null || n > MAX_GRAMS_PER_100G ? null : n;
};

/**
 * The user's words as literal text. Search-a-licious reads `q` as Lucene
 * syntax, so "(light" or "brand:x" was a query error that read as "Branded
 * foods are unavailable" (#17 review 15). The app's own country clause is
 * added after this, and stays syntax.
 */
export function escapeLucene(text: string): string {
  return text.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

/** A search hit, or null when it cannot be logged: no name, no energy, or an unusable id. */
export function mapSearchHit(p: OffProduct): FoodHit | null {
  const n = p.nutriments ?? {};
  const kcal = amount(n["energy-kcal_100g"]);
  const name = p.product_name?.trim().slice(0, MAX_NAME);
  const externalId = String(p.code ?? p.product_name ?? "").trim();
  if (!name || kcal === null || kcal > MAX_KCAL_PER_100G || !externalId || externalId.length > MAX_EXTERNAL_ID) return null;
  const macros = [n.proteins_100g, n.fat_100g, n.carbohydrates_100g].map(amount);
  if (macros.some((g) => g !== null && g > MAX_GRAMS_PER_100G)) return null;
  const [protein, fat, carbs] = macros;
  const per100g = {
    kcal,
    p: protein ?? 0,
    f: fat ?? 0,
    c: carbs ?? 0,
    fibre: label(n.fiber_100g),
    sugar: label(n.sugars_100g),
    satFat: label(n["saturated-fat_100g"]),
    salt: label(n.salt_100g),
  };
  return {
    source: "off",
    externalId,
    name,
    brand: brandOf(p.brands)?.slice(0, MAX_NAME),
    // Search-a-licious does not index serving sizes, so text hits offer 100 g only.
    servings: [{ label: "100 g", grams: 100, ...per100g }],
    per100g,
  };
}

async function searchOnce(q: string, signal: AbortSignal): Promise<FoodHit[]> {
  const res = await fetch(`${OFF_SEARCH_URL}?q=${encodeURIComponent(q)}&page_size=20&langs=en`, {
    headers: { "User-Agent": USER_AGENT },
    signal,
  });
  if (!res.ok) throw new Error(`Open Food Facts search ${res.status}`);
  const body = (await res.json()) as { hits?: OffProduct[] };
  return (body.hits ?? []).map(mapSearchHit).filter((h): h is FoodHit => h !== null);
}

/**
 * UK-tagged products first; when that leaves fewer than MIN_UK_HITS, top up
 * with unfiltered hits, deduped by code - v1's edge function, ported. One
 * deadline covers both requests, so a slow Open Food Facts costs at most
 * timeoutMs. Only the search text leaves this server: no user, no cookie.
 */
export async function searchOpenFoodFacts(q: string, timeoutMs = OFF_TIMEOUT_MS): Promise<FoodHit[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  const terms = escapeLucene(q);
  const uk = await searchOnce(`${UK_CLAUSE} ${terms}`, signal);
  if (uk.length >= MIN_UK_HITS) return uk;
  try {
    const all = await searchOnce(terms, signal);
    const seen = new Set(uk.map((h) => h.externalId));
    return [...uk, ...all.filter((h) => !seen.has(h.externalId))];
  } catch {
    return uk;
  }
}

export const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const PRODUCT_FIELDS = "code,product_name,brands,nutriments,serving_size,serving_quantity";
/** The diary POST's serving_grams limit (routes/nutrition.ts foodBody). */
const MAX_SERVING_GRAMS = 5000;

export interface OffProductPage extends OffProduct {
  serving_size?: string;
  serving_quantity?: number | string;
}

/**
 * A product page as a hit: the search mapping's rules (part 1), plus the label
 * serving when the product gives a usable size. The serving's values are
 * scaled from the per-100 g ones, so the two can never disagree.
 */
export function mapProduct(p: OffProductPage, code: string): FoodHit | null {
  const hit = mapSearchHit({ ...p, code });
  if (!hit || !hit.per100g) return null;
  const grams = num(p.serving_quantity);
  const servings = [...hit.servings];
  if (grams !== null && grams > 0 && grams <= MAX_SERVING_GRAMS) {
    const k = grams / 100;
    const v = hit.per100g;
    const scaled = (x: number | null | undefined) => (x === null || x === undefined ? null : x * k);
    const size = p.serving_size?.trim() || `${grams} g`;
    servings.push({
      label: `1 serving (${size})`.slice(0, 100),
      grams,
      kcal: v.kcal * k, p: v.p * k, f: v.f * k, c: v.c * k,
      fibre: scaled(v.fibre), sugar: scaled(v.sugar), satFat: scaled(v.satFat), salt: scaled(v.salt),
    });
  }
  return { ...hit, barcode: code, servings };
}

/**
 * One product by barcode. Null when Open Food Facts has no such product, or
 * none that can be logged. Throws when it can't be reached, which the route
 * answers as 502.
 */
export async function lookupBarcode(code: string, timeoutMs = OFF_TIMEOUT_MS): Promise<FoodHit | null> {
  const res = await fetch(`${OFF_PRODUCT_URL}/${code}?fields=${PRODUCT_FIELDS}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts product ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: OffProductPage };
  if (body.status !== 1 || !body.product) return null;
  return mapProduct(body.product, code);
}
