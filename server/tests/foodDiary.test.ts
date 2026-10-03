import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { addEntry, listDiary, rescaleEntry, deleteEntry } from "../src/repositories/foodLog";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

const NULLS = {
  serving_description: null, serving_grams: null,
  kcal_per_serving: null, protein_per_serving: null, fat_per_serving: null, carbs_per_serving: null,
  fibre_per_serving: null, sugar_per_serving: null, sat_fat_per_serving: null, salt_per_serving: null,
};
const OATS = {
  ...NULLS, source: "cofid", external_id: "11-800", name: "Oats", brand: null,
  kcal_per_100g: 380, protein_per_100g: 13, fat_per_100g: 7, carbs_per_100g: 65,
  fibre_per_100g: 9, sugar_per_100g: null, sat_fat_per_100g: 1.2, salt_per_100g: 0.02,
};
const entry = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-21", name: "Oats", quantity: 80, unit: "g",
  calories: 304, protein_g: 10.4, fat_g: 5.6, carbs_g: 52,
  fibre_g: 7.2, sugar_g: null, sat_fat_g: 0.96, salt_g: 0.016, ...over,
});

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return { agent, id: (await findUserByEmail(who.email))!.id };
}
const count = async (table: string) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`)).rows[0]!.n;

describe("food diary", () => {
  it("requires a session", async () => {
    await request(app).get("/api/nutrition/diary?date=2026-09-21").expect(401);
    await request(app).post("/api/nutrition/diary").send(entry()).expect(401);
  });

  it("logs a search food and stores it in the library once", async () => {
    const { agent } = await signedIn(alice);
    const first = await agent.post("/api/nutrition/diary").send(entry({ food: OATS })).expect(201);
    await agent.post("/api/nutrition/diary").send(entry({ food: OATS, quantity: 50, calories: 190 })).expect(201);

    expect(first.body.food_item_id).toEqual(expect.any(String));
    expect(await count(T.foodItems)).toBe(1);
    expect(await count(T.foodLogEntries)).toBe(2);
  });

  it("stores a typed-in food every time: manual foods have no id to match on", async () => {
    const { agent } = await signedIn(alice);
    const wrap = { ...OATS, source: "manual", external_id: null, name: "Chicken wrap" };
    await agent.post("/api/nutrition/diary").send(entry({ food: wrap })).expect(201);
    await agent.post("/api/nutrition/diary").send(entry({ food: wrap })).expect(201);
    expect(await count(T.foodItems)).toBe(2);
  });

  it("lists a day in logged order, with the date unshifted", async () => {
    const { agent } = await signedIn(alice);
    await agent.post("/api/nutrition/diary").send(entry({ name: "Oats" })).expect(201);
    await agent.post("/api/nutrition/diary").send(entry({ name: "Banana" })).expect(201);
    const res = await agent.get("/api/nutrition/diary?date=2026-09-21").expect(200);
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Oats", "Banana"]);
    expect(res.body[0].date).toBe("2026-09-21");
    expect(res.body[0].sugar_g).toBeNull();
    expect(res.body[0].fibre_g).toBe(7.2);
  });

  it("rejects bad input", async () => {
    const { agent } = await signedIn(alice);
    await agent.post("/api/nutrition/diary").send(entry({ date: "21/09/2026" })).expect(400);
    await agent.post("/api/nutrition/diary").send(entry({ calories: -1 })).expect(400);
    await agent.post("/api/nutrition/diary").send(entry({ quantity: 0 })).expect(400);
    await agent
      .post("/api/nutrition/diary")
      .send(entry({ food: OATS, food_item_id: "00000000-0000-0000-0000-000000000000" }))
      .expect(400);
    await agent.post("/api/nutrition/diary").send(entry({ food: { ...OATS, source: "manual" } })).expect(400);
  });

  it("rescales every nutrient when the amount changes, and keeps unknowns unknown", async () => {
    const { agent } = await signedIn(alice);
    const created = await agent.post("/api/nutrition/diary").send(entry()).expect(201);
    const res = await agent.patch(`/api/nutrition/diary/${created.body.id}`).send({ quantity: 40 }).expect(200);
    expect(res.body).toMatchObject({ quantity: 40, calories: 152, carbs_g: 26, fibre_g: 3.6, sugar_g: null });
  });

  it("copies a day, keeping the times and the order", async () => {
    const { agent, id } = await signedIn(alice);
    const lunch = await addEntry(id, entry({ name: "Wrap" }) as never);
    const breakfast = await addEntry(id, entry({ name: "Oats" }) as never);
    await pool.query(`UPDATE ${T.foodLogEntries} SET logged_at = $2 WHERE id = $1`, [lunch!.id, "2026-09-21T12:05:00Z"]);
    await pool.query(`UPDATE ${T.foodLogEntries} SET logged_at = $2 WHERE id = $1`, [breakfast!.id, "2026-09-21T07:10:00Z"]);

    const res = await agent.post("/api/nutrition/diary/copy").send({ from: "2026-09-21", to: "2026-09-22" }).expect(201);
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Oats", "Wrap"]);
    expect(res.body.map((e: { date: string }) => e.date)).toEqual(["2026-09-22", "2026-09-22"]);
    expect(new Date(res.body[0].logged_at).toISOString()).toBe("2026-09-22T07:10:00.000Z");
    expect(await listDiary(id, "2026-09-21")).toHaveLength(2);
  });

  it("refuses to copy a day onto itself, and copies nothing from an empty day", async () => {
    const { agent } = await signedIn(alice);
    await agent.post("/api/nutrition/diary/copy").send({ from: "2026-09-21", to: "2026-09-21" }).expect(400);
    const res = await agent.post("/api/nutrition/diary/copy").send({ from: "2026-09-01", to: "2026-09-22" }).expect(201);
    expect(res.body).toEqual([]);
  });

  it("deletes its own entry", async () => {
    const { agent } = await signedIn(alice);
    const created = await agent.post("/api/nutrition/diary").send(entry()).expect(201);
    await agent.delete(`/api/nutrition/diary/${created.body.id}`).expect(204);
    expect((await agent.get("/api/nutrition/diary?date=2026-09-21")).body).toEqual([]);
  });
});

describe("food diary ownership scoping", () => {
  it("never lists, changes, deletes or copies another user's entries", async () => {
    const { id: aliceId } = await signedIn(alice);
    const { agent: bobAgent, id: bobId } = await signedIn(bob);
    const mine = await addEntry(aliceId, entry() as never);

    expect((await bobAgent.get("/api/nutrition/diary?date=2026-09-21").expect(200)).body).toEqual([]);
    await bobAgent.patch(`/api/nutrition/diary/${mine!.id}`).send({ quantity: 1 }).expect(404);
    await bobAgent.delete(`/api/nutrition/diary/${mine!.id}`).expect(404);
    const copied = await bobAgent.post("/api/nutrition/diary/copy").send({ from: "2026-09-21", to: "2026-09-22" }).expect(201);
    expect(copied.body).toEqual([]);

    // At the repository too: the scoping is in the SQL, not the route.
    expect(await rescaleEntry(bobId, mine!.id, 1)).toBeNull();
    expect(await deleteEntry(bobId, mine!.id)).toBe(false);
    expect(await listDiary(aliceId, "2026-09-21")).toHaveLength(1);
  });

  // Linking to someone else's food would leak it back out through Recent.
  it("will not link an entry to another user's food", async () => {
    const { agent: aliceAgent } = await signedIn(alice);
    const { agent: bobAgent } = await signedIn(bob);
    const aliceFood = (await aliceAgent.post("/api/nutrition/diary").send(entry({ food: OATS })).expect(201)).body.food_item_id;

    await bobAgent.post("/api/nutrition/diary").send(entry({ food_item_id: aliceFood })).expect(404);
    expect(await count(T.foodLogEntries)).toBe(1);
  });
});
