import { describe, it, expect } from "vitest";
import request from "supertest";
import { shiftISO } from "@dashboard/shared";
import { createApp } from "../src/app";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return agent;
}

describe("goals endpoints", () => {
  it("sets the weight goal, adds lift goals, and refuses a sixth or a duplicate", async () => {
    const agent = await signedIn(alice);
    expect((await agent.put("/api/goals/weight").send({ target_kg: 75 }).expect(200)).body).toMatchObject({ kind: "weight", target_kg: 75 });
    await agent.post("/api/goals/lifts").send({ exercise_name: "Lat Pulldown", target_kg: 75 }).expect(201);
    const dup = await agent.post("/api/goals/lifts").send({ exercise_name: "Lat Pulldown", target_kg: 80 }).expect(409);
    expect(dup.body.message).toMatch(/already/i);
    for (const name of ["A", "B", "C", "D"]) await agent.post("/api/goals/lifts").send({ exercise_name: name, target_kg: 50 }).expect(201);
    const full = await agent.post("/api/goals/lifts").send({ exercise_name: "E", target_kg: 50 }).expect(409);
    expect(full.body.message).toMatch(/5/);
    expect((await agent.get("/api/goals").expect(200)).body).toHaveLength(6);
  });

  it("refuses a target that is not a weight", async () => {
    const agent = await signedIn(alice);
    await agent.put("/api/goals/weight").send({ target_kg: 0 }).expect(400);
    await agent.post("/api/goals/lifts").send({ exercise_name: "", target_kg: 50 }).expect(400);
  });

  it("deletes a goal, and answers 404 for one that is not yours", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    const goal = (await a.put("/api/goals/weight").send({ target_kg: 75 })).body;
    await b.delete(`/api/goals/${goal.id}`).expect(404);
    await a.delete(`/api/goals/${goal.id}`).expect(204);
  });
});

describe("projections endpoint", () => {
  it("projects a weight goal and explains a lift goal without enough sessions", async () => {
    const agent = await signedIn(alice);
    const today = "2026-09-30";
    for (let i = 0; i < 14; i++) {
      await agent.post("/api/weight").send({ date: shiftISO(today, -i), weight_kg: 79 + (0.5 * i) / 7 }).expect(201);
    }
    await agent.put("/api/goals/weight").send({ target_kg: 78 });
    await agent.post("/api/workouts/sets").send({ date: today, day_type: 2, exercise_name: "Row", set_number: 1, weight_kg: 60, reps: 8, is_bodyweight: false });
    await agent.post("/api/goals/lifts").send({ exercise_name: "Row", target_kg: 70 });

    const res = await agent.get(`/api/insights/projections?today=${today}`).expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ status: "projected", date: "2026-10-12" }),
      expect.objectContaining({ status: "not-enough-data", have: 1, need: 6 }),
    ]);
  });

  // Once found broken: with no start, the
  // direction was re-derived from the trend each time, so a goal set before
  // any weigh-in could never be reached ("Trending away" once past it).
  it("reaches a weight goal set before any weigh-in, once the trend passes it", async () => {
    const agent = await signedIn(alice);
    const today = "2026-09-30";
    expect((await agent.put("/api/goals/weight").send({ target_kg: 78 })).body.start_kg).toBeNull();
    // Oldest first, falling from 80 to 77.5: the first weigh-in becomes the start.
    for (let i = 13; i >= 0; i--) {
      await agent.post("/api/weight").send({ date: shiftISO(today, -i), weight_kg: 77.5 + (2.5 * i) / 13 }).expect(201);
    }
    expect((await agent.get("/api/goals")).body[0].start_kg).toBe(80);
    const res = await agent.get(`/api/insights/projections?today=${today}`).expect(200);
    expect(res.body).toEqual([expect.objectContaining({ status: "reached" })]);
  });

  it("refuses an impossible date", async () => {
    const agent = await signedIn(alice);
    await agent.get("/api/insights/projections?today=2026-02-30").expect(400);
  });
});
