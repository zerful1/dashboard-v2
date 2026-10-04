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
  if (!name || kcal === null || !externalId || externalId.length > MAX_EXTERNAL_ID) return null;
  const per100g = {
    kcal,
    p: amount(n.proteins_100g) ?? 0,
    f: amount(n.fat_100g) ?? 0,
    c: amount(n.carbohydrates_100g) ?? 0,
    fibre: amount(n.fiber_100g),
    sugar: amount(n.sugars_100g),
    satFat: amount(n["saturated-fat_100g"]),
    salt: amount(n.salt_100g),
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
