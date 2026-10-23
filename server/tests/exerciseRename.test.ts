import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { addExercise, listExercises } from "../src/repositories/exercises";
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

/** A session with one set, so the cascade has history to rewrite. */
async function logOneSet(agent: Agent, name: string, dayType = 1) {
  await agent
    .post("/api/workouts/sets")
    .send({
      date: "2026-08-16",
      day_type: dayType,
      exercise_name: name,
      set_number: 1,
      weight_kg: 80,
      reps: 8,
      is_bodyweight: false,
    })
    .expect(201);
}

describe("exercise rename cascade", () => {
  it("rewrites the template AND historical sets together", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Bench" }).expect(201);
    await logOneSet(agent, "Bench");

    const res = await agent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "Bench Press" })
      .expect(200);

    expect(res.body.exercisesUpdated).toBe(1);
    expect(res.body.setsUpdated).toBe(1);

    const userId = (await findUserByEmail(alice.email))!.id;
    const { rows } = await pool.query(
      `SELECT DISTINCT exercise_name FROM ${T.workoutSets} WHERE user_id = $1`,
      [userId],
    );
    expect(rows).toEqual([{ exercise_name: "Bench Press" }]);
  });

  it("renames the exercise on EVERY day it appears", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Bench" }).expect(201);
    await agent.post("/api/exercises").send({ day_type: 2, exercise_name: "Bench" }).expect(201);

    // Matching by name rather than id is what makes this work: renaming the
    // day-1 row by id would leave the day-2 row under the old name.
    const res = await agent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "Bench Press" })
      .expect(200);

    expect(res.body.exercisesUpdated).toBe(2);
    const userId = (await findUserByEmail(alice.email))!.id;
    expect((await listExercises(userId, 2))[0]!.exercise_name).toBe("Bench Press");
  });

  it("rejects a rename colliding with another exercise on the SAME day", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Bench" }).expect(201);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Squat" }).expect(201);

    await agent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "Squat" })
      .expect(409);
  });

  it("merges onto a name from another day, adopting its exact casing", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Bench" }).expect(201);
    await agent
      .post("/api/exercises")
      .send({ day_type: 2, exercise_name: "Bench Press" })
      .expect(201);

    // Requesting lowercase must still adopt "Bench Press", or the merge creates
    // a case-variant split rather than joining them — which is the whole point
    // of merging.
    const res = await agent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "bench press" })
      .expect(200);

    expect(res.body.merged).toBe(true);
    expect(res.body.finalName).toBe("Bench Press");

    const userId = (await findUserByEmail(alice.email))!.id;
    expect((await listExercises(userId, 1))[0]!.exercise_name).toBe("Bench Press");
  });

  it("leaves sets belonging to a different exercise alone", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Bench" }).expect(201);
    await logOneSet(agent, "Bench");
    await agent
      .post("/api/workouts/sets")
      .send({
        date: "2026-08-16",
        day_type: 1,
        exercise_name: "Squat",
        set_number: 1,
        weight_kg: 100,
        reps: 5,
        is_bodyweight: false,
      })
      .expect(201);

    await agent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "Bench Press" })
      .expect(200);

    const userId = (await findUserByEmail(alice.email))!.id;
    const { rows } = await pool.query(
      `SELECT exercise_name FROM ${T.workoutSets} WHERE user_id = $1 ORDER BY exercise_name`,
      [userId],
    );
    expect(rows.map((r) => r.exercise_name)).toEqual(["Bench Press", "Squat"]);
  });

  it("rewrites history even when the template row is already gone", async () => {
    // The case that makes name-matching load-bearing rather than convenient:
    // an exercise dropped from the template still owns months of sets, and a
    // rename must still reach them.
    const agent = await signedIn(alice);
    await logOneSet(agent, "Bench");

    const res = await agent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "Bench Press" })
      .expect(200);

    expect(res.body.exercisesUpdated).toBe(0);
    expect(res.body.setsUpdated).toBe(1);
  });
});

// A lift goal matches its exercise by name, so a rename
// that left it behind cut it off from its history ("0 of 6 sessions" for good).
describe("rename carries lift goals", () => {
  it("moves a lift goal to the new name", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Lat Pulldown" }).expect(201);
    await logOneSet(agent, "Lat Pulldown");
    await agent.post("/api/goals/lifts").send({ exercise_name: "Lat Pulldown", target_kg: 75 }).expect(201);

    await agent.post("/api/exercises/rename")
      .send({ old_name: "Lat Pulldown", day_type: 1, new_name: "Lat Pull Down" })
      .expect(200);

    const goals = (await agent.get("/api/goals").expect(200)).body;
    expect(goals.map((g: { exercise_name: string }) => g.exercise_name)).toEqual(["Lat Pull Down"]);
  });

  it("keeps the goal already on the new name when two exercises merge", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Row" }).expect(201);
    await agent.post("/api/exercises").send({ day_type: 2, exercise_name: "Seated Row" }).expect(201);
    await agent.post("/api/goals/lifts").send({ exercise_name: "Row", target_kg: 60 }).expect(201);
    await agent.post("/api/goals/lifts").send({ exercise_name: "Seated Row", target_kg: 70 }).expect(201);

    await agent.post("/api/exercises/rename")
      .send({ old_name: "Row", day_type: 1, new_name: "Seated Row" })
      .expect(200);

    const goals = (await agent.get("/api/goals").expect(200)).body;
    expect(goals.map((g: { exercise_name: string; target_kg: number }) => [g.exercise_name, g.target_kg])).toEqual([
      ["Seated Row", 70],
    ]);
  });
});

describe("rename ownership scoping", () => {
  it("never renames another user's exercises or sets", async () => {
    await signedIn(alice);
    const bobAgent = await signedIn(bob);
    const aliceId = (await findUserByEmail(alice.email))!.id;

    await addExercise(aliceId, 1, "Bench");

    // Bob renames "Bench" — he has none, so nothing should change anywhere.
    const res = await bobAgent
      .post("/api/exercises/rename")
      .send({ old_name: "Bench", day_type: 1, new_name: "Bench Press" })
      .expect(200);
    expect(res.body.exercisesUpdated).toBe(0);

    expect((await listExercises(aliceId, 1))[0]!.exercise_name).toBe("Bench");
  });
});
