import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { shiftISO } from "@dashboard/shared";
import { addEntry } from "../src/repositories/foodLog";
import { upsertWeight } from "../src/repositories/bodyWeight";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
const TODAY = "2026-09-23";
const START = shiftISO(TODAY, -28);

const meal = (date: string, calories: number) => ({
  date, name: "Food", quantity: 1, unit: "serving", calories, protein_g: 0, fat_g: 0, carbs_g: 0,
  fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null,
});

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return { agent, id: (await findUserByEmail(who.email))!.id };
}

async function seedFlatMonth(userId: string, kcal = 2000) {
  for (let n = 0; n < 28; n++) await upsertWeight(userId, { date: shiftISO(START, n), weight_kg: 80 });
  for (let k = 0; k < 14; k++) await addEntry(userId, meal(shiftISO(START, k * 2), kcal) as never);
}

describe("TDEE hint", () => {
  it("requires a session and a day", async () => {
    await request(app).get(`/api/nutrition/tdee?today=${TODAY}`).expect(401);
    const { agent } = await signedIn(alice);
    await agent.get("/api/nutrition/tdee").expect(400);
  });

  it("has no formula until all four body details and a weigh-in exist", async () => {
    const { agent, id } = await signedIn(alice);
    await agent.patch("/api/profile").send({ height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate" });
    expect((await agent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200)).body.formula).toBeNull();

    await upsertWeight(id, { date: "2026-09-22", weight_kg: 80 });
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780, x 1.55 = 2759
    expect((await agent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200)).body.formula)
      .toEqual({ kcal: 2759, weight_kg: 80, age: 30 });
  });

  // Break-check: swap averageDailyIntake into tdeeFromLog and this reads 1000.
  it("estimates from logged days only, over the 28 days ending yesterday", async () => {
    const { agent, id } = await signedIn(alice);
    await seedFlatMonth(id);
    await addEntry(id, meal(TODAY, 5000) as never); // today is still being eaten

    const res = await agent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200);
    expect(res.body.adaptive).toEqual({ kcal: 2000, days_logged: 14, weigh_ins: 28 });
    expect(res.body.days_logged).toBe(14);
  });
  // #17 review (10): partial logging and noisy weigh-ins could show an absurd figure.
  it("hides an adaptive figure outside the human range", async () => {
    const { agent, id } = await signedIn(alice);
    await seedFlatMonth(id, 800);
    expect((await agent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200)).body).toMatchObject({ adaptive: null, days_logged: 14 });
  });

  it("hides an adaptive figure far from the formula, and keeps one near it", async () => {
    const details = { height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate" };
    const a = await signedIn(alice);
    await a.agent.patch("/api/profile").send(details);
    await seedFlatMonth(a.id, 1500); // 46% under the formula's 2759
    expect((await a.agent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200)).body).toMatchObject({
      adaptive: null, formula: { kcal: 2759 },
    });
    const b = await signedIn(bob);
    await b.agent.patch("/api/profile").send(details);
    await seedFlatMonth(b.id, 2400); // 13% under
    expect((await b.agent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200)).body.adaptive)
      .toEqual({ kcal: 2400, days_logged: 14, weigh_ins: 28 });
  });
});

describe("TDEE hint ownership scoping", () => {
  it("never counts another user's food or weigh-ins", async () => {
    const { id: aliceId } = await signedIn(alice);
    const { agent: bobAgent } = await signedIn(bob);
    await seedFlatMonth(aliceId);

    const res = await bobAgent.get(`/api/nutrition/tdee?today=${TODAY}`).expect(200);
    expect(res.body).toEqual({ formula: null, adaptive: null, days_logged: 0 });
  });
});
