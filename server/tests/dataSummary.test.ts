import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
type Agent = ReturnType<typeof request.agent>;

async function signedIn(who: typeof alice): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return agent;
}
const weighIn = (agent: Agent, date: string) => agent.post("/api/weight").send({ date, weight_kg: 80 }).expect(201);
const logSet = (agent: Agent, date: string, set_number = 1) =>
  agent.post("/api/workouts/sets")
    .send({ date, day_type: 1, exercise_name: "Squat", set_number, weight_kg: 100, reps: 5, is_bodyweight: false })
    .expect(201);
const logFood = (agent: Agent, date: string) =>
  agent.post("/api/nutrition/diary")
    .send({ date, name: "Oats", quantity: 100, unit: "g", calories: 380, protein_g: 13, fat_g: 7, carbs_g: 60,
            fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null })
    .expect(201);
const addHabit = (agent: Agent) => agent.post("/api/habits").send({ name: "Stretch", emoji: null }).expect(201);

/** Alice's data: two weigh-ins, one session of two sets, food on two days, one habit. */
async function aliceLogs(agent: Agent) {
  await weighIn(agent, "2026-09-02");
  await weighIn(agent, "2026-09-03");
  await logSet(agent, "2026-09-01", 1);
  await logSet(agent, "2026-09-01", 2);
  await logFood(agent, "2026-09-04");
  await logFood(agent, "2026-09-04");
  await logFood(agent, "2026-09-05");
  await addHabit(agent);
}

describe("data summary", () => {
  it("counts weigh-ins, sessions, food days and habits, since the earliest date", async () => {
    const agent = await signedIn(alice);
    await aliceLogs(agent);
    const res = await agent.get("/api/export/summary").expect(200);
    expect(res.body).toEqual({ since: "2026-09-01", weighIns: 2, sessions: 1, foodDays: 2, habits: 1 });
  });

  it("reports nothing for a new account", async () => {
    const agent = await signedIn(alice);
    const res = await agent.get("/api/export/summary").expect(200);
    expect(res.body).toEqual({ since: null, weighIns: 0, sessions: 0, foodDays: 0, habits: 0 });
  });
});

describe("data summary ownership scoping", () => {
  it("never counts another user's rows", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    await aliceLogs(a);
    expect((await b.get("/api/export/summary").expect(200)).body).toEqual({
      since: null, weighIns: 0, sessions: 0, foodDays: 0, habits: 0,
    });
    // Positive complement: Alice's own are counted.
    expect((await a.get("/api/export/summary").expect(200)).body.weighIns).toBe(2);
  });

  it("requires a session", async () => {
    await request(app).get("/api/export/summary").expect(401);
  });
});
