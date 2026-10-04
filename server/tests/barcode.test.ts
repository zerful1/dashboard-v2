import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { OFF_PRODUCT_URL } from "../src/services/openFoodFacts";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
// A real product response (Coca-Cola Light, saved 2026-10-05): its serving is "250ml".
const COKE = readFileSync(join(__dirname, "fixtures", "off-product-coke-light.json"), "utf8");

afterEach(() => vi.restoreAllMocks());

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who).expect(201);
  return agent;
}

/** Stub Open Food Facts' product endpoint by URL; returns the URLs asked for. */
function stubProducts(byCode: Record<string, string | number | Error>): string[] {
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const code = url.slice(OFF_PRODUCT_URL.length + 1).split("?")[0]!;
    const answer = byCode[code] ?? 404;
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return new Response(JSON.stringify({ status: 0 }), { status: answer });
    return new Response(answer, { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return urls;
}

const MANUAL_BAR = {
  source: "manual", external_id: null, name: "Homemade flapjack", brand: null, barcode: "5012345678900",
  serving_description: "1 square", serving_grams: 60, kcal_per_serving: 250, protein_per_serving: 4,
  fat_per_serving: 11, carbs_per_serving: 33, kcal_per_100g: null, protein_per_100g: null, fat_per_100g: null,
  carbs_per_100g: null, fibre_per_100g: null, sugar_per_100g: null, sat_fat_per_100g: null, salt_per_100g: null,
  fibre_per_serving: null, sugar_per_serving: null, sat_fat_per_serving: null, salt_per_serving: null,
};
const logBar = { date: "2026-10-05", name: "Homemade flapjack", quantity: 1, unit: "serving", calories: 250,
  protein_g: 4, fat_g: 11, carbs_g: 33, fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null, food: MANUAL_BAR };

describe("GET /api/food/barcode/:code", () => {
  it("is for signed-in users, and refuses a malformed code", async () => {
    await request(app).get("/api/food/barcode/5000112548167").expect(401);
    const agent = await signedIn(alice);
    await agent.get("/api/food/barcode/12ab").expect(400);
    await agent.get("/api/food/barcode/1234567").expect(400);
  });

  // Review focus 2: a food scanned or added before comes back as saved, from
  // the library, without asking Open Food Facts.
  it("finds the caller's own food first, as the item itself", async () => {
    const urls = stubProducts({});
    const agent = await signedIn(alice);
    await agent.post("/api/nutrition/diary").send(logBar).expect(201);
    const res = await agent.get("/api/food/barcode/5012345678900").expect(200);
    expect(res.body).toMatchObject({ source: "library", item: { name: "Homemade flapjack", barcode: "5012345678900" } });
    expect(urls).toEqual([]);
  });

  it("never finds another user's food", async () => {
    const a = await signedIn(alice);
    await a.post("/api/nutrition/diary").send(logBar).expect(201);
    stubProducts({});
    const b = await signedIn(bob);
    const res = await b.get("/api/food/barcode/5012345678900").expect(404);
    expect(res.body.message).toBe("That barcode isn't in Open Food Facts");
  });

  // Review focus 3: a real product, with its serving in ml.
  it("maps a real Open Food Facts product, serving size included", async () => {
    stubProducts({ "5000112548167": COKE });
    const agent = await signedIn(alice);
    const { body } = await agent.get("/api/food/barcode/5000112548167").expect(200);
    expect(body.source).toBe("off");
    expect(body.hit).toMatchObject({ source: "off", externalId: "5000112548167", barcode: "5000112548167", name: "Coca-Cola Light" });
    const serving = body.hit.servings.find((s: { label: string }) => s.label !== "100 g");
    expect(serving).toMatchObject({ label: "1 serving (250ml)", grams: 250 });
    expect(serving.kcal).toBeCloseTo(body.hit.per100g.kcal * 2.5, 5);
  });

  it("offers only per-100 g for a product without a serving size", async () => {
    const noServing = JSON.parse(COKE);
    delete noServing.product.serving_size;
    delete noServing.product.serving_quantity;
    stubProducts({ "5000112548167": JSON.stringify(noServing) });
    const agent = await signedIn(alice);
    const { body } = await agent.get("/api/food/barcode/5000112548167").expect(200);
    expect(body.hit.servings.map((s: { label: string }) => s.label)).toEqual(["100 g"]);
  });

  it("answers 404 for a code Open Food Facts doesn't know", async () => {
    stubProducts({});
    const agent = await signedIn(alice);
    expect((await agent.get("/api/food/barcode/5099999999999").expect(404)).body.message).toBe("That barcode isn't in Open Food Facts");
  });

  // Review focus 4.
  it("answers 502 when Open Food Facts can't be reached", async () => {
    stubProducts({ "5000112548167": new TypeError("fetch failed") });
    const agent = await signedIn(alice);
    expect((await agent.get("/api/food/barcode/5000112548167").expect(502)).body.message).toBe("Product lookup is unavailable right now");
  });

  // Review focus 5: scanners read UPC-A as 12 digits; Open Food Facts often
  // files the same product under its 13-digit EAN form.
  it("retries a 12-digit UPC-A as its 13-digit EAN", async () => {
    const urls = stubProducts({ "0049000006582": COKE });
    const agent = await signedIn(alice);
    await agent.get("/api/food/barcode/049000006582").expect(200);
    expect(urls.map((u) => u.slice(OFF_PRODUCT_URL.length + 1).split("?")[0])).toEqual(["049000006582", "0049000006582"]);
  });
});
