import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { addEntry, listRecents } from "../src/repositories/foodLog";
import { findUserByEmail } from "../src/repositories/users";
import { listFoodItemsByIds } from "../src/repositories/foodItems";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

const NULLS = {
  serving_description: null, serving_grams: null,
  kcal_per_serving: null, protein_per_serving: null, fat_per_serving: null, carbs_per_serving: null,
  fibre_per_100g: null, sugar_per_100g: null, sat_fat_per_100g: null, salt_per_100g: null,
  fibre_per_serving: null, sugar_per_serving: null, sat_fat_per_serving: null, salt_per_serving: null,
};
const food = (external_id: string, name: string) => ({
  ...NULLS, source: "off", external_id, name, brand: null,
  kcal_per_100g: 100, protein_per_100g: 1, fat_per_100g: 1, carbs_per_100g: 1,
});
const entry = (name: string, quantity: number, over: Record<string, unknown> = {}) => ({
  date: "2026-09-21", name, quantity, unit: "g", calories: quantity, protein_g: 1, fat_g: 1, carbs_g: 1,
  fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null, ...over,
});

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return { agent, id: (await findUserByEmail(who.email))!.id };
}

describe("recent foods", () => {
  it("lists each food once, newest first, with the amount last logged", async () => {
    const { agent, id } = await signedIn(alice);
    await addEntry(id, entry("Oats", 80, { food: food("1", "Oats") }) as never);
    await addEntry(id, entry("Banana", 120, { food: food("2", "Banana") }) as never);
    await addEntry(id, entry("Oats", 50, { food: food("1", "Oats") }) as never);

    const res = await agent.get("/api/nutrition/recents").expect(200);
    expect(res.body.map((r: { entry: { name: string } }) => r.entry.name)).toEqual(["Oats", "Banana"]);
    expect(res.body[0].entry.quantity).toBe(50);
    expect(res.body[0].item).toMatchObject({ name: "Oats", external_id: "1", kcal_per_100g: 100 });
  });

  it("returns no item for an entry that was never linked", async () => {
    const { agent, id } = await signedIn(alice);
    await addEntry(id, entry("Mystery", 10) as never);
    const res = await agent.get("/api/nutrition/recents").expect(200);
    expect(res.body[0].item).toBeNull();
  });

  it("stops at thirty foods", async () => {
    const { id } = await signedIn(alice);
    for (let i = 0; i < 35; i++) await addEntry(id, entry(`Food ${i}`, 10) as never);
    expect(await listRecents(id)).toHaveLength(30);
  });
});

describe("recent foods ownership scoping", () => {
  it("never shows another user's foods", async () => {
    const { id: aliceId } = await signedIn(alice);
    const { agent: bobAgent, id: bobId } = await signedIn(bob);
    await addEntry(aliceId, entry("Oats", 80, { food: food("1", "Oats") }) as never);

    expect((await bobAgent.get("/api/nutrition/recents").expect(200)).body).toEqual([]);
    expect(await listRecents(bobId)).toEqual([]);
  });
});

// The food library's own ownership test. The recents test above never reaches
// listFoodItemsByIds for Bob (he has no entries), so it could not catch a
// missing user filter there.
describe("food library ownership scoping", () => {
  it("never returns another user's food by id", async () => {
    const { id: aliceId } = await signedIn(alice);
    const { id: bobId } = await signedIn(bob);
    const mine = await addEntry(aliceId, entry("Oats", 80, { food: food("1", "Oats") }) as never);
    const aliceItemId = mine!.food_item_id!;

    expect(await listFoodItemsByIds(bobId, [aliceItemId])).toEqual([]);
    // Positive complement: the owner gets it back.
    expect((await listFoodItemsByIds(aliceId, [aliceItemId])).map((i) => i.id)).toEqual([aliceItemId]);
  });

  it("keeps two users' copies of the same product apart", async () => {
    const { id: aliceId } = await signedIn(alice);
    const { id: bobId } = await signedIn(bob);
    const a = await addEntry(aliceId, entry("Oats", 80, { food: food("1", "Oats") }) as never);
    const b = await addEntry(bobId, entry("Oats", 80, { food: { ...food("1", "Oats"), kcal_per_100g: 999 } }) as never);

    expect(b!.food_item_id).not.toBe(a!.food_item_id);
    const [aliceItem] = await listFoodItemsByIds(aliceId, [a!.food_item_id!]);
    expect(aliceItem!.kcal_per_100g).toBe(100);
  });
});
