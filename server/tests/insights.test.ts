import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
type Agent = ReturnType<typeof request.agent>;

// 2026-09-21 is a Monday: its week runs to Sunday 27 Sep, and the week before is 14–20 Sep.

async function signedIn(who: typeof alice): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return agent;
}
const logSet = (agent: Agent, date: string, weight_kg: number, reps: number, set_number = 1, exercise_name = "Bench Press") =>
  agent.post("/api/workouts/sets")
    .send({ date, day_type: 3, exercise_name, set_number, weight_kg, reps, is_bodyweight: false })
    .expect(201);
const logFood = (agent: Agent, date: string, calories: number, protein_g: number) =>
  agent.post("/api/nutrition/diary")
    .send({ date, name: "Oats", quantity: 100, unit: "g", calories, protein_g, fat_g: 1, carbs_g: 1,
            fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null })
    .expect(201);

describe("weekly review endpoint", () => {
  it("refuses a week that is not a real Monday", async () => {
    const agent = await signedIn(alice);
    await agent.get("/api/insights/review?week=2026-09-22").expect(400);
    await agent.get("/api/insights/review?week=nope").expect(400);
    // Positive complement.
    await agent.get("/api/insights/review?week=2026-09-21").expect(200);
  });

  it("reports the week and the one before it", async () => {
    const agent = await signedIn(alice);
    await logSet(agent, "2026-09-22", 60, 5);
    await logSet(agent, "2026-09-24", 62.5, 4);
    await logSet(agent, "2026-09-16", 60, 5);
    await agent.post("/api/weight").send({ date: "2026-09-22", weight_kg: 78 }).expect(201);
    await agent.post("/api/weight").send({ date: "2026-09-27", weight_kg: 77 }).expect(201);
    await logFood(agent, "2026-09-23", 2000, 150);
    await agent.post("/api/nutrition/targets")
      .send({ effective_from: "2026-06-09", goal_mode: "cut", calories: 2402, protein_g: 180, fat_g: 93, carbs_g: 210 })
      .expect(201);

    const res = await agent.get("/api/insights/review?week=2026-09-21").expect(200);
    expect(res.body).toMatchObject({
      week: "2026-09-21",
      trainingTarget: 5,
      days: [
        { date: "2026-09-21", trained: false, kcal: null, weightKg: null },
        { date: "2026-09-22", trained: true, kcal: null, weightKg: 78 },
        { date: "2026-09-23", trained: false, kcal: 2000, weightKg: null },
        { date: "2026-09-24", trained: true, kcal: null, weightKg: null },
        { date: "2026-09-25", trained: false, kcal: null, weightKg: null },
        { date: "2026-09-26", trained: false, kcal: null, weightKg: null },
        { date: "2026-09-27", trained: false, kcal: null, weightKg: 77 },
      ],
      foodTarget: { calories: 2402, proteinG: 180 },
      current: {
        training: { days: 2, sets: 2, volume: 550 },
        food: { daysLogged: 1, avgKcal: 2000, avgProteinG: 150 },
        weight: { average: 77.5, weighIns: 2 },
      },
      previous: { training: { days: 1, sets: 1, volume: 300 }, food: { daysLogged: 0, avgKcal: null } },
    });
  });
});

// Review finding: TargetsSheet saves with effective_from = today, so two saves
// in a day tie, and the tie-break compared created_at as a string while
// node-pg handed it back as a Date. Production already holds such a pair.
describe("weekly review with targets saved twice in a day", () => {
  it("answers with the later target instead of failing", async () => {
    const agent = await signedIn(alice);
    const target = (calories: number, protein_g: number) =>
      agent.post("/api/nutrition/targets")
        .send({ effective_from: "2026-09-01", goal_mode: "cut", calories, protein_g, fat_g: 80, carbs_g: 200 })
        .expect(201);
    await target(2402, 180);
    await target(2500, 185);
    const res = await agent.get("/api/insights/review?week=2026-09-21").expect(200);
    expect(res.body.foodTarget).toEqual({ calories: 2500, proteinG: 185 });
  });
});

describe("records endpoint", () => {
  it("lists a session that beat the exercise's best", async () => {
    const agent = await signedIn(alice);
    await logSet(agent, "2026-09-01", 60, 8);
    await logSet(agent, "2026-09-08", 66, 8);
    const res = await agent.get("/api/insights/records").expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ date: "2026-09-08", exercise_name: "Bench Press", heaviest: { weightKg: 66, reps: 8, previousKg: 60 } }),
    ]);
  });
});

describe("insights ownership scoping", () => {
  it("never counts another user's sets, food or weigh-ins", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    await logSet(a, "2026-09-22", 60, 5);
    await logSet(a, "2026-09-29", 70, 5);
    await logFood(a, "2026-09-23", 2000, 150);
    await a.post("/api/weight").send({ date: "2026-09-22", weight_kg: 78 }).expect(201);

    const review = await b.get("/api/insights/review?week=2026-09-21").expect(200);
    expect(review.body.current).toEqual({
      training: { days: 0, sets: 0, volume: 0 },
      food: { daysLogged: 0, avgKcal: null, avgProteinG: null },
      weight: { average: null, weighIns: 0 },
    });
    expect((await b.get("/api/insights/records").expect(200)).body).toEqual([]);
    // Positive complement: Alice sees her own.
    expect((await a.get("/api/insights/records").expect(200)).body).toHaveLength(1);
  });

  it("requires a session", async () => {
    await request(app).get("/api/insights/records").expect(401);
  });
});
