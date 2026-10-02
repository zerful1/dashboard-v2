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
  brands?: string;
  nutriments?: Record<string, unknown>;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A search hit, or null when it cannot be logged: no name, or no energy. */
export function mapSearchHit(p: OffProduct): FoodHit | null {
  const n = p.nutriments ?? {};
  const kcal = num(n["energy-kcal_100g"]);
  if (!p.product_name || kcal === null) return null;
  const per100g = {
    kcal,
    p: num(n.proteins_100g) ?? 0,
    f: num(n.fat_100g) ?? 0,
    c: num(n.carbohydrates_100g) ?? 0,
    fibre: num(n.fiber_100g),
    sugar: num(n.sugars_100g),
    satFat: num(n["saturated-fat_100g"]),
    salt: num(n.salt_100g),
  };
  return {
    source: "off",
    externalId: String(p.code ?? p.product_name),
    name: p.product_name,
    brand: p.brands || undefined,
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
  const uk = await searchOnce(`${UK_CLAUSE} ${q}`, signal);
  if (uk.length >= MIN_UK_HITS) return uk;
  try {
    const all = await searchOnce(q, signal);
    const seen = new Set(uk.map((h) => h.externalId));
    return [...uk, ...all.filter((h) => !seen.has(h.externalId))];
  } catch {
    return uk;
  }
}
