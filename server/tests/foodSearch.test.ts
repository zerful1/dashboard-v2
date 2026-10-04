import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { mapSearchHit, searchOpenFoodFacts, OFF_SEARCH_URL } from "../src/services/openFoodFacts";
import { searchCofid } from "../src/repositories/cofid";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };

// cofid_foods is global reference data that truncateAll() leaves alone, so
// these rows are the test's own and it removes them.
const COFID = [
  ["T-1", "Oats, rolled", 375, 11, 8, 60, 9, 1, 1.5, 0.02],
  ["T-2", "Biscuits, digestive, half coated in chocolate", 490, 7, 23, 65, 3, 30, 12, 1],
  ["T-3", "Chicken, breast, grilled", 148, 32, 2.2, 0, null, 0, 0.6, 0.2],
];

beforeEach(async () => {
  for (const r of COFID) {
    await pool.query(
      `INSERT INTO ${T.cofidFoods}
         (food_code, name, food_group, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
          fibre_per_100g, sugar_per_100g, sat_fat_per_100g, salt_per_100g)
       VALUES ($1, $2, 'T', $3, $4, $5, $6, $7, $8, $9, $10)`,
      r,
    );
  }
});

afterEach(async () => {
  await pool.query(`DELETE FROM ${T.cofidFoods} WHERE food_code LIKE 'T-%'`);
  vi.restoreAllMocks();
});

type Call = { url: string; init?: RequestInit };
function stubOff(handler: (url: string) => unknown | Promise<unknown>): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const body = await handler(url);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}
const product = (code: string, name: string, extra: Record<string, unknown> = {}) => ({
  code, product_name: name, brands: "Brand",
  nutriments: { "energy-kcal_100g": 400, proteins_100g: 10, fat_100g: 5, carbohydrates_100g: 70, fiber_100g: 6, ...extra },
});

async function signedIn() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(alice);
  return agent;
}

describe("food search", () => {
  it("requires a session and a query of at least two characters", async () => {
    await request(app).get("/api/food/search?q=oats").expect(401);
    const agent = await signedIn();
    stubOff(() => ({ hits: [] }));
    await agent.get("/api/food/search?q=o").expect(400);
  });

  // Measured on the real table: a plain substring match on "oat" returns the
  // "coated" biscuit. Words must match at the start of a word.
  it("matches CoFID words at the start of a word", async () => {
    const agent = await signedIn();
    stubOff(() => ({ hits: [] }));
    const res = await agent.get("/api/food/search?q=oat").expect(200);
    const names = res.body.hits.map((h: { name: string }) => h.name);
    expect(names).toContain("Oats, rolled");
    expect(names).not.toContain("Biscuits, digestive, half coated in chocolate");
  });

  it("finds every word as a prefix, as you type", async () => {
    const agent = await signedIn();
    stubOff(() => ({ hits: [] }));
    const res = await agent.get("/api/food/search?q=chick%20bre").expect(200);
    expect(res.body.hits[0]).toMatchObject({
      source: "cofid", externalId: "T-3", name: "Chicken, breast, grilled",
      per100g: { kcal: 148, fibre: null, salt: 0.2 },
    });
  });

  // Review focus 1: search text is user input and goes into a regex.
  it("survives regex and LIKE metacharacters", async () => {
    const agent = await signedIn();
    stubOff(() => ({ hits: [] }));
    // An unbalanced bracket or a bare quantifier is an invalid regex unless
    // escaped - those are what catch a missing escape. The balanced ones beside
    // them must keep working too.
    for (const q of ["(light)", "M&S", "50%", "c++", "a\\b", "[x]", "a(", "[[", "**"]) {
      const res = await agent.get(`/api/food/search?q=${encodeURIComponent(q)}`).expect(200);
      // The route turns a CoFID failure into a warning, not an error, so a 200
      // alone proves nothing: the UK table must actually have answered.
      expect(res.body.warnings).toBeUndefined();
    }
  });

  it("puts branded hits first, with their label nutrients", async () => {
    const agent = await signedIn();
    stubOff(() => ({ hits: [0, 1, 2, 3, 4].map((i) => product(`50${i}`, `Oat bar ${i}`)) }));
    const res = await agent.get("/api/food/search?q=oat").expect(200);
    expect(res.body.hits[0]).toMatchObject({ source: "off", name: "Oat bar 0", brand: "Brand", per100g: { fibre: 6, sugar: null } });
    expect(res.body.hits.at(-1).source).toBe("cofid");
    expect(res.body.warnings).toBeUndefined();
  });

  it("tops sparse UK results up with unfiltered ones, without duplicates", async () => {
    const agent = await signedIn();
    stubOff((url) =>
      url.includes("countries_tags")
        ? { hits: [product("1", "UK oats")] }
        : { hits: [product("1", "UK oats"), product("2", "Other oats")] },
    );
    const res = await agent.get("/api/food/search?q=oats").expect(200);
    const off = res.body.hits.filter((h: { source: string }) => h.source === "off");
    expect(off.map((h: { externalId: string }) => h.externalId)).toEqual(["1", "2"]);
  });

  it("still answers with CoFID when Open Food Facts is down", async () => {
    const agent = await signedIn();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const res = await agent.get("/api/food/search?q=oat").expect(200);
    expect(res.body.hits.map((h: { name: string }) => h.name)).toEqual(["Oats, rolled"]);
    expect(res.body.warnings).toEqual(["Branded foods are unavailable right now"]);
  });

  it("sends Open Food Facts only the search text", async () => {
    const agent = await signedIn();
    const calls = stubOff(() => ({ hits: [] }));
    await agent.get("/api/food/search?q=oats").expect(200);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.url.startsWith(OFF_SEARCH_URL)).toBe(true);
      expect(c.url).not.toContain("alice");
      expect(Object.keys(c.init?.headers ?? {})).toEqual(["User-Agent"]);
    }
  });
});

describe("Open Food Facts", () => {
  // Found in the browser, not by a test: Search-a-licious returns `brands` as an
  // ARRAY. Passed through, it reached the diary POST as ["Oatly"] and failed
  // validation, so no branded product from search could ever be logged.
  it("turns a brands array into one brand string", () => {
    const n = { "energy-kcal_100g": 61 };
    expect(mapSearchHit({ code: "1", product_name: "Oat drink", brands: ["Oatly", "Oatly AB"], nutriments: n })!.brand)
      .toBe("Oatly, Oatly AB");
    expect(mapSearchHit({ code: "1", product_name: "Oat drink", brands: "Oatly", nutriments: n })!.brand).toBe("Oatly");
    expect(mapSearchHit({ code: "1", product_name: "Oat drink", brands: [], nutriments: n })!.brand).toBeUndefined();
  });

  it("drops products that cannot be logged", () => {
    expect(mapSearchHit({ code: "1", product_name: "No energy", nutriments: {} })).toBeNull();
    expect(mapSearchHit({ code: "1", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });

  it("gives up at the deadline instead of hanging the search", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const started = Date.now();
    await expect(searchOpenFoodFacts("oats", 50)).rejects.toBeDefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("Open Food Facts mapping limits", () => {
  // #17 review (4): hits the diary POST would refuse.
  it("treats a negative nutrient as unknown, and a negative energy as no energy", () => {
    const hit = mapSearchHit({ code: "1", product_name: "Bar", nutriments: { "energy-kcal_100g": 400, proteins_100g: 5, fat_100g: -2, sugars_100g: -1 } });
    expect(hit?.per100g).toMatchObject({ kcal: 400, p: 5, f: 0, sugar: null });
    expect(mapSearchHit({ code: "2", product_name: "Bar", nutriments: { "energy-kcal_100g": -5 } })).toBeNull();
  });

  it("trims an over-long name and brand, and leaves out an over-long id", () => {
    const long = "x".repeat(250);
    const hit = mapSearchHit({ code: "3", product_name: long, brands: long, nutriments: { "energy-kcal_100g": 100 } });
    expect(hit?.name).toHaveLength(200);
    expect(hit?.brand).toHaveLength(200);
    expect(mapSearchHit({ code: "9".repeat(101), product_name: "Bar", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });
});

describe("Open Food Facts query text", () => {
  // #17 review (15): "(light" or "brand:x" was Lucene syntax, and the error
  // read as "Branded foods are unavailable".
  it("sends the user's words as text, not query syntax", async () => {
    const calls = stubOff(() => ({ hits: [] }));
    await searchOpenFoodFacts("(light brand:x");
    expect(new URL(calls[0]!.url).searchParams.get("q")).toBe('countries_tags:"en:united-kingdom" \\(light brand\\:x');
  });
});

describe("CoFID search size", () => {
  // #17 review (16): the spec asks for 20 generic foods; the code returned 15.
  it("returns up to 20 generic foods", async () => {
    for (let i = 1; i <= 22; i++) {
      await pool.query(
        `INSERT INTO ${T.cofidFoods}
           (food_code, name, food_group, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
            fibre_per_100g, sugar_per_100g, sat_fat_per_100g, salt_per_100g)
         VALUES ($1, $2, 'T', 100, 1, 1, 1, NULL, NULL, NULL, NULL)`,
        [`T-L${i}`, `Testfood ${String(i).padStart(2, "0")}`],
      );
    }
    expect(await searchCofid("Testfood")).toHaveLength(20);
  });
});
