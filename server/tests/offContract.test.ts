import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { buildEntryInput, hitToChoice, type FoodHit } from "@dashboard/shared";
import { createApp } from "../src/app";
import { mapSearchHit, type OffProduct } from "../src/services/openFoodFacts";

const app = createApp();
// A real Search-a-licious response trimmed to the fields the mapping reads, not a hand-written fixture.
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "off-search-snickers.json"), "utf8"),
) as { hits: OffProduct[] };

describe("Open Food Facts contract", () => {
  // From #17: nothing proved a real hit could be logged end to end.
  it("logs every hit the mapping lets through", async () => {
    const hits = fixture.hits.map(mapSearchHit).filter((h): h is FoodHit => h !== null);
    expect(hits.length).toBeGreaterThan(10);
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "alice@example.com", password: "correct-horse-9" }).expect(201);
    for (const hit of hits) {
      const choice = hitToChoice(hit);
      const res = await agent.post("/api/nutrition/diary").send(buildEntryInput(choice, choice.servings[0]!, 100, "g", "2026-10-04"));
      expect(res.status, `${hit.externalId} ${hit.name}: ${JSON.stringify(res.body)}`).toBe(201);
    }
  });
});
