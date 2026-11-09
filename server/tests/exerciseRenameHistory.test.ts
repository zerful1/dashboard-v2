import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { listExercises } from "../src/repositories/exercises";
import { findUserByEmail } from "../src/repositories/users";

/**
 * workout_sets is UNIQUE (session_id, exercise_name, set_number), and a name
 * lives on in history after its template row is pruned. Renaming onto such a
 * name used to hit that constraint as a 500 whenever one past workout held the
 * same set number under both names: the check before the rename read only the
 * template.
 */

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

type Agent = ReturnType<typeof request.agent>;

async function signedIn(creds: typeof alice): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}

const logOneSet = (agent: Agent, name: string, dayType = 1) =>
  agent
    .post("/api/workouts/sets")
    .send({ date: "2026-08-16", day_type: dayType, exercise_name: name, set_number: 1, weight_kg: 80, reps: 8, is_bodyweight: false })
    .expect(201);

const addExercise = (agent: Agent, name: string) =>
  agent.post("/api/exercises").send({ day_type: 1, exercise_name: name }).expect(201);

const rename = (agent: Agent) =>
  agent.post("/api/exercises/rename").send({ old_name: "Incline DB Press", day_type: 1, new_name: "Incline Press" });

/** Two exercises logged in one workout, then the second pruned from the template. */
async function prunedSibling(agent: Agent) {
  await addExercise(agent, "Incline DB Press");
  const pruned = await addExercise(agent, "Incline Press");
  await logOneSet(agent, "Incline DB Press");
  await logOneSet(agent, "Incline Press");
  await agent.delete(`/api/exercises/${pruned.body.id}`).expect(204);
}

async function names(email: string) {
  const userId = (await findUserByEmail(email))!.id;
  const sets = await pool.query<{ exercise_name: string }>(
    `SELECT exercise_name FROM ${T.workoutSets} WHERE user_id = $1 ORDER BY exercise_name`,
    [userId],
  );
  return {
    sets: sets.rows.map((r) => r.exercise_name),
    template: (await listExercises(userId, 1)).map((e) => e.exercise_name),
  };
}

describe("renaming onto a name the history already holds", () => {
  it("refuses with 409, and changes nothing, when one workout holds the same set under both", async () => {
    const agent = await signedIn(alice);
    await prunedSibling(agent);

    const res = await rename(agent).expect(409);

    expect(res.body.message).toMatch(/same workout/i);
    // Neither the template row nor a single set moved.
    expect(await names(alice.email)).toEqual({
      sets: ["Incline DB Press", "Incline Press"],
      template: ["Incline DB Press"],
    });
  });

  it("still merges when no workout holds both", async () => {
    const agent = await signedIn(alice);
    await addExercise(agent, "Incline DB Press");
    await logOneSet(agent, "Incline DB Press");
    // History only, in another day's workout: no template row, no shared session.
    await logOneSet(agent, "Incline Press", 2);

    const res = await rename(agent).expect(200);

    expect(res.body.setsUpdated).toBe(1);
    expect((await names(alice.email)).sets).toEqual(["Incline Press", "Incline Press"]);
  });

  it("is not tripped by another user's workout holding both names", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    await prunedSibling(b);
    await addExercise(a, "Incline DB Press");
    await logOneSet(a, "Incline DB Press");

    await rename(a).expect(200);
    // Bob's history is as it was.
    expect((await names(bob.email)).sets).toEqual(["Incline DB Press", "Incline Press"]);
  });
});
