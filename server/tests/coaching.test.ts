import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { recentSessionGroups } from "../src/repositories/coaching";
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
  sets: { w: number; r: number }[],
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
        is_bodyweight: false,
      })
      .expect(201);
  }
}

describe("coaching", () => {
  it("returns null for an exercise with no history", async () => {
    const agent = await signedIn(alice);
    const res = await agent.get("/api/workouts/coaching?exercise_name=Nothing").expect(200);
    expect(res.body).toBeNull();
  });

  it("says ADD WEIGHT when every top-weight set reached 8", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-16", [
      { w: 80, r: 8 },
      { w: 80, r: 8 },
      { w: 80, r: 8 },
    ]);

    const res = await agent
      .get("/api/workouts/coaching?exercise_name=Bench%20Press")
      .expect(200);
    expect(res.body.tag).toBe("ADD WEIGHT");
    expect(res.body.headline).toContain("82.5");
  });

  it("says ADD A REP when only some top-weight sets reached 8", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-16", [
      { w: 80, r: 8 },
      { w: 80, r: 6 },
      { w: 80, r: 5 },
    ]);

    const res = await agent
      .get("/api/workouts/coaching?exercise_name=Bench%20Press")
      .expect(200);
    expect(res.body.tag).toBe("ADD A REP");
  });

  it("groups by session, newest first", async () => {
    const agent = await signedIn(alice);
    await logSets(agent, "2026-08-02", [{ w: 70, r: 8 }]);
    await logSets(agent, "2026-08-09", [{ w: 75, r: 8 }]);
    await logSets(agent, "2026-08-16", [{ w: 80, r: 8 }]);

    const userId = (await findUserByEmail(alice.email))!.id;
    const groups = await recentSessionGroups(userId, "Bench Press", 3);

    // Index 0 must be the newest — computeRecommendation reads it as "latest",
    // so a reversed list yields advice from the oldest session while looking
    // entirely plausible.
    expect(groups[0]![0]!.weight_kg).toBe(80);
    expect(groups[2]![0]!.weight_kg).toBe(70);
  });

  it("limits to the requested number of sessions", async () => {
    const agent = await signedIn(alice);
    for (const d of ["2026-07-26", "2026-08-02", "2026-08-09", "2026-08-16"]) {
      await logSets(agent, d, [{ w: 80, r: 5 }]);
    }
    const userId = (await findUserByEmail(alice.email))!.id;
    expect(await recentSessionGroups(userId, "Bench Press", 3)).toHaveLength(3);
  });

  it("keeps the newest three when more exist, not the oldest three", async () => {
    // The limit and the ordering are separate mistakes; this pins the pair.
    const agent = await signedIn(alice);
    for (const [d, w] of [
      ["2026-07-26", 60],
      ["2026-08-02", 70],
      ["2026-08-09", 75],
      ["2026-08-16", 80],
    ] as const) {
      await logSets(agent, d, [{ w, r: 5 }]);
    }
    const userId = (await findUserByEmail(alice.email))!.id;
    const groups = await recentSessionGroups(userId, "Bench Press", 3);
    expect(groups.map((g) => g[0]!.weight_kg)).toEqual([80, 75, 70]);
  });

  it("short-circuits to ADD A REP for a bodyweight top set", async () => {
    const agent = await signedIn(alice);
    await agent
      .post("/api/workouts/sets")
      .send({
        date: "2026-08-16",
        day_type: 3,
        exercise_name: "Pull Up",
        set_number: 1,
        weight_kg: 0,
        reps: 9,
        is_bodyweight: true,
      })
      .expect(201);

    const res = await agent.get("/api/workouts/coaching?exercise_name=Pull%20Up").expect(200);
    expect(res.body.tag).toBe("ADD A REP");
    expect(res.body.headline).toContain("10");
  });
});

describe("coaching ownership scoping", () => {
  it("never bases advice on another user's sets", async () => {
    const aliceAgent = await signedIn(alice);
    const bobAgent = await signedIn(bob);

    await logSets(aliceAgent, "2026-08-16", [
      { w: 80, r: 8 },
      { w: 80, r: 8 },
      { w: 80, r: 8 },
    ]);

    // Bob has never done it, so he must get null — not Alice's ADD WEIGHT.
    const res = await bobAgent
      .get("/api/workouts/coaching?exercise_name=Bench%20Press")
      .expect(200);
    expect(res.body).toBeNull();
  });
});
