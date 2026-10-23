import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { addEntry, dayTotals, listDiary, rescaleEntry, deleteEntry } from "../src/repositories/foodLog";
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

  // A text-search hit carries no serving sizes, and logging it
  // overwrote the serving data a product lookup had stored.
  it("keeps a saved food's serving data when the same food is logged without any", async () => {
    const { agent, id } = await signedIn(alice);
    const BAR = {
      ...OATS, source: "off", external_id: "5000159484480", name: "Snickers",
      serving_description: "1 bar (45 g)", serving_grams: 45,
      kcal_per_serving: 230, protein_per_serving: 4, fat_per_serving: 11, carbs_per_serving: 27,
    };
    await agent.post("/api/nutrition/diary").send(entry({ name: "Snickers", food: BAR })).expect(201);
    await agent.post("/api/nutrition/diary").send(entry({ name: "Snickers", food: { ...BAR, ...NULLS, kcal_per_100g: 510 } })).expect(201);
    const { rows } = await pool.query(
      `SELECT serving_description, serving_grams::float8 AS serving_grams,
              kcal_per_serving::float8 AS kcal_per_serving, kcal_per_100g::float8 AS kcal_per_100g
         FROM ${T.foodItems} WHERE user_id = $1`,
      [id],
    );
    // Serving data kept; the per-100 g value still refreshed.
    expect(rows).toEqual([{ serving_description: "1 bar (45 g)", serving_grams: 45, kcal_per_serving: 230, kcal_per_100g: 510 }]);
  });

  // Copying across a clock change moved every entry by an hour.
  it("keeps the local time when copying across a clock change", async () => {
    const { agent, id } = await signedIn(alice); // profiles.timezone defaults to Europe/London
    const e = await addEntry(id, entry({ date: "2026-10-24", name: "Oats" }) as never);
    // 08:00 in London on Saturday 24 October is 07:00Z (BST). The clocks go back on the 25th.
    await pool.query(`UPDATE ${T.foodLogEntries} SET logged_at = $2 WHERE id = $1`, [e!.id, "2026-10-24T07:00:00Z"]);
    const res = await agent.post("/api/nutrition/diary/copy").send({ from: "2026-10-24", to: "2026-10-26" }).expect(201);
    // 08:00 in London on Monday 26 October is 08:00Z (GMT).
    expect(new Date(res.body[0].logged_at).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  // A scanned food keeps its barcode, so the next scan finds it in the library.
  it("saves a food's barcode, and a later log without one keeps it", async () => {
    const { agent, id } = await signedIn(alice);
    const COKE = { ...OATS, source: "off", external_id: "5000112548167", name: "Coca-Cola Light", barcode: "5000112548167" };
    await agent.post("/api/nutrition/diary").send(entry({ name: "Coca-Cola Light", food: COKE })).expect(201);
    await agent.post("/api/nutrition/diary").send(entry({ name: "Coca-Cola Light", food: { ...COKE, barcode: null } })).expect(201);
    const { rows } = await pool.query(`SELECT barcode FROM ${T.foodItems} WHERE user_id = $1`, [id]);
    expect(rows).toEqual([{ barcode: "5000112548167" }]);
  });

  it("refuses a malformed barcode", async () => {
    const { agent } = await signedIn(alice);
    await agent.post("/api/nutrition/diary").send(entry({ food: { ...OATS, barcode: "12ab" } })).expect(400);
  });

  // Serving data is replaced whole or kept whole, so a
  // new serving's unknown label values never keep the old serving's.
  it("replaces a stored serving whole when a new one arrives", async () => {
    const { agent, id } = await signedIn(alice);
    const A = { ...OATS, source: "off", external_id: "5000159407236", name: "Mars",
      serving_description: "1 bar (51 g)", serving_grams: 51, kcal_per_serving: 230, sugar_per_serving: 30 };
    await agent.post("/api/nutrition/diary").send(entry({ name: "Mars", food: A })).expect(201);
    await agent.post("/api/nutrition/diary").send(entry({ name: "Mars", food: {
      ...A, serving_description: "1 fun size (17 g)", serving_grams: 17, kcal_per_serving: 76, sugar_per_serving: null } })).expect(201);
    const { rows } = await pool.query(
      `SELECT serving_description, serving_grams::float8 AS g, sugar_per_serving::float8 AS sugar FROM ${T.foodItems} WHERE user_id = $1`, [id]);
    expect(rows).toEqual([{ serving_description: "1 fun size (17 g)", g: 17, sugar: null }]);
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

// Food's 7-day strip.
describe("food diary, day totals", () => {
  it("requires a session", async () => {
    await request(app).get("/api/nutrition/days?from=2026-09-15&to=2026-09-21").expect(401);
  });

  it("sums calories and protein per day, ascending, inside the range only", async () => {
    const { agent } = await signedIn(alice);
    const log = (date: string, calories: number, protein_g: number) =>
      agent.post("/api/nutrition/diary").send(entry({ date, calories, protein_g })).expect(201);
    await log("2026-09-21", 300, 10.5);
    await log("2026-09-21", 200.5, 20);
    await log("2026-09-15", 100, 5);
    await log("2026-09-14", 999, 99);
    await log("2026-09-22", 999, 99);

    const res = await agent.get("/api/nutrition/days?from=2026-09-15&to=2026-09-21").expect(200);
    expect(res.body).toEqual([
      { date: "2026-09-15", calories: 100, protein_g: 5 },
      { date: "2026-09-21", calories: 500.5, protein_g: 30.5 },
    ]);
  });

  it("refuses a backwards range or one over 31 days, and allows exactly 31", async () => {
    const { agent } = await signedIn(alice);
    await agent.get("/api/nutrition/days?from=2026-09-21&to=2026-09-15").expect(400);
    await agent.get("/api/nutrition/days?from=2026-09-01&to=2026-10-02").expect(400);
    await agent.get("/api/nutrition/days?from=2026-09-01&to=2026-10-01").expect(200);
  });

  // shiftISO throws on a malformed date, and zod refines dirty input.
  it("answers a malformed date with 400, not 500", async () => {
    const { agent } = await signedIn(alice);
    await agent.get("/api/nutrition/days?from=21/09/2026&to=2026-09-21").expect(400);
    await agent.get("/api/nutrition/days?from=2026-09-15&to=yesterday").expect(400);
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

  it("never counts another user's entries in the day totals", async () => {
    const { id: aliceId } = await signedIn(alice);
    const { agent: bobAgent, id: bobId } = await signedIn(bob);
    await addEntry(aliceId, entry() as never);

    expect((await bobAgent.get("/api/nutrition/days?from=2026-09-15&to=2026-09-21").expect(200)).body).toEqual([]);
    // At the repository too: the scoping is in the SQL, not the route.
    expect(await dayTotals(bobId, "2026-09-15", "2026-09-21")).toEqual([]);
    expect(await dayTotals(aliceId, "2026-09-15", "2026-09-21")).toHaveLength(1);
  });
});
