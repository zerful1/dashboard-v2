import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { computeExerciseStats } from "@dashboard/shared";
import { exerciseStatRows, historyExerciseNames } from "../src/repositories/stats";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

type Agent = ReturnType<typeof request.agent>;

async function signedIn(creds: typeof alice): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}

async function logSets(
  agent: Agent,
  date: string,
  sets: { w: number; r: number; bw?: boolean }[],
  name = "Bench Press",
) {
  for (const [i, s] of sets.entries()) {
    await agent
      .post("/api/workouts/sets")
      .send({
        date,
        day_type: 3,
        exercise_name: name,
        set_number: i + 1,
        weight_kg: s.w,
        reps: s.r,
        is_bodyweight: s.bw ?? false,
      })
      .expect(201);
  }
}

describe("stats endpoint", () => {
  it("requires a session", async () => {
    await request(app).get("/api/workouts/stats?exercise_name=X").expect(401);
  });

  it("returns sets plus a session_id to date map", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-09", [{ w: 80, r: 8 }]);
    await logSets(agent, "2026-08-16", [{ w: 82.5, r: 6 }]);

    const res = await agent.get("/api/workouts/stats?exercise_name=Bench%20Press").expect(200);
    expect(res.body.sets).toHaveLength(2);
    expect(Object.values(res.body.sessionDates).sort()).toEqual(["2026-08-09", "2026-08-16"]);
  });

  it("feeds computeExerciseStats correctly end to end", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-09", [
      { w: 80, r: 8 },
      { w: 80, r: 6 },
    ]);
    await logSets(agent, "2026-08-16", [{ w: 85, r: 5 }]);

    const res = await agent.get("/api/workouts/stats?exercise_name=Bench%20Press").expect(200);
    const stats = computeExerciseStats(
      res.body.sets,
      new Map(Object.entries(res.body.sessionDates)),
    );

    expect(stats.heaviestSet?.weight_kg).toBe(85);
    expect(stats.sessionCount).toBe(2);
    expect(stats.lastTrainedDate).toBe("2026-08-16");
    expect(stats.isBodyweightOnly).toBe(false);
    expect(stats.chartData.map((p) => p.date)).toEqual(["2026-08-09", "2026-08-16"]);
  });

  it("marks a bodyweight-only exercise", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-16", [{ w: 0, r: 9, bw: true }], "Pull Up");

    const res = await agent.get("/api/workouts/stats?exercise_name=Pull%20Up").expect(200);
    const stats = computeExerciseStats(
      res.body.sets,
      new Map(Object.entries(res.body.sessionDates)),
    );
    expect(stats.isBodyweightOnly).toBe(true);
    expect(stats.chartData[0]!.topReps).toBe(9);
  });

  it("returns empty for an unknown exercise", async () => {
    const agent = await signedIn(alice);
    const res = await agent.get("/api/workouts/stats?exercise_name=Nothing").expect(200);
    expect(res.body.sets).toEqual([]);
  });

  it("keeps dates as strings", async () => {
    const agent = await signedIn(alice);
    // September is BST — a Date round trip would render this as the 25th.
    await logSets(agent, "2025-09-26", [{ w: 80, r: 8 }]);
    const res = await agent.get("/api/workouts/stats?exercise_name=Bench%20Press").expect(200);
    expect(Object.values(res.body.sessionDates)[0]).toBe("2025-09-26");
  });
});

describe("session detail", () => {
  it("returns sets and cardio for one session", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-16", [{ w: 80, r: 8 }]);
    await agent
      .post("/api/cardio")
      .send({
        date: "2026-08-16",
        day_type: 3,
        exercise: "Treadmill",
        distance_miles: 2,
        duration_minutes: 20,
      })
      .expect(201);

    const s = (await agent.get("/api/workouts/session?date=2026-08-16&day_type=3")).body;
    const res = await agent.get(`/api/workouts/session-detail?session_id=${s.id}`).expect(200);

    expect(res.body.sets).toHaveLength(1);
    expect(res.body.cardio).toHaveLength(1);
    expect(res.body.cardio[0].distance_miles).toBe(2);
  });

  it("preserves set_number beyond four, so a long session is not truncated", async () => {
    // v1's detail table hardcoded four columns. Real sessions reach 22 sets, so
    // the shape of this response is what makes a derived column count possible.
    const agent = await signedIn(alice);
    await logSets(
      agent,
      "2026-08-16",
      Array.from({ length: 6 }, (_, i) => ({ w: 100, r: 5 + i })),
    );

    const s = (await agent.get("/api/workouts/session?date=2026-08-16&day_type=3")).body;
    const res = await agent.get(`/api/workouts/session-detail?session_id=${s.id}`).expect(200);

    expect(res.body.sets).toHaveLength(6);
    expect(Math.max(...res.body.sets.map((x: { set_number: number }) => x.set_number))).toBe(6);
  });
});

describe("history exercise names", () => {
  it("lists names from HISTORY, including ones no longer in the template", async () => {
    const agent = await signedIn(alice);
    await agent
      .post("/api/exercises")
      .send({ day_type: 3, exercise_name: "Bench Press" })
      .expect(201);
    await logSets(agent, "2026-08-16", [{ w: 80, r: 8 }]);
    // Logged ad hoc, never a template row — must still be reachable in stats.
    await logSets(agent, "2026-08-16", [{ w: 20, r: 12 }], "Cable Fly");

    const res = await agent.get("/api/workouts/exercise-names").expect(200);
    expect(res.body).toEqual(["Bench Press", "Cable Fly"]);
  });
});

describe("stats ownership scoping", () => {
  it("never returns another user's sets, detail or names", async () => {
    const aliceAgent = await signedIn(alice);
    const bobAgent = await signedIn(bob);
    await logSets(aliceAgent, "2026-08-16", [{ w: 80, r: 8 }]);

    expect((await bobAgent.get("/api/workouts/stats?exercise_name=Bench%20Press")).body.sets).toEqual(
      [],
    );
    expect((await bobAgent.get("/api/workouts/exercise-names")).body).toEqual([]);

    const aliceSession = (await aliceAgent.get("/api/workouts/session?date=2026-08-16&day_type=3"))
      .body;
    const detail = await bobAgent
      .get(`/api/workouts/session-detail?session_id=${aliceSession.id}`)
      .expect(200);
    expect(detail.body.sets).toEqual([]);
    expect(detail.body.cardio).toEqual([]);

    const aliceId = (await findUserByEmail(alice.email))!.id;
    expect(await historyExerciseNames(aliceId)).toEqual(["Bench Press"]);
    expect((await exerciseStatRows(aliceId, "Bench Press")).sets).toHaveLength(1);
  });
});
