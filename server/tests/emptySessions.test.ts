import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";

/**
 * A session exists because something was logged in it. Deleting the last thing
 * in it used to leave the session behind: History listed it as "Cardio", the
 * weekly review counted it as a day trained, and nothing could remove it.
 */

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
const DAY = { date: "2026-08-16", day_type: 1 };

async function signedIn(creds: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}
type Agent = Awaited<ReturnType<typeof signedIn>>;

const logSet = async (agent: Agent, set_number = 1) =>
  (
    await agent
      .post("/api/workouts/sets")
      .send({ ...DAY, exercise_name: "Squat", set_number, weight_kg: 100, reps: 5, is_bodyweight: false })
      .expect(201)
  ).body as { id: string; session_id: string };

const logCardio = async (agent: Agent) =>
  (
    await agent
      .post("/api/cardio")
      .send({ ...DAY, exercise: "Treadmill", distance_miles: 3, duration_minutes: 30, speed: null, incline: null, calories_burned: null })
      .expect(201)
  ).body as { id: string; session_id: string };

const sessionDates = async (agent: Agent) =>
  ((await agent.get("/api/workouts/sessions").expect(200)).body as { date: string }[]).map((s) => s.date);

describe("a session with nothing left in it", () => {
  it("goes when its last set is deleted", async () => {
    const agent = await signedIn(alice);
    const set = await logSet(agent);
    expect(await sessionDates(agent)).toEqual([DAY.date]);

    await agent.delete(`/api/workouts/sets/${set.id}`).expect(204);

    expect(await sessionDates(agent)).toEqual([]);
    const day = await agent.get(`/api/workouts/session?date=${DAY.date}&day_type=1`).expect(200);
    expect(day.body).toBeNull();
  });

  it("stays while another set is left", async () => {
    const agent = await signedIn(alice);
    const first = await logSet(agent, 1);
    await logSet(agent, 2);

    await agent.delete(`/api/workouts/sets/${first.id}`).expect(204);

    expect(await sessionDates(agent)).toEqual([DAY.date]);
  });

  it("stays for its cardio when the last set goes, and for its sets when the last cardio goes", async () => {
    const agent = await signedIn(alice);
    const set = await logSet(agent);
    const cardio = await logCardio(agent);
    expect(cardio.session_id).toBe(set.session_id);

    await agent.delete(`/api/workouts/sets/${set.id}`).expect(204);
    expect(await sessionDates(agent)).toEqual([DAY.date]);

    const again = await logSet(agent);
    await agent.delete(`/api/cardio/${cardio.id}`).expect(204);
    expect(await sessionDates(agent)).toEqual([DAY.date]);
    expect(again.session_id).toBe(set.session_id);
  });

  it("goes when its last cardio entry is deleted", async () => {
    const agent = await signedIn(alice);
    const cardio = await logCardio(agent);

    await agent.delete(`/api/cardio/${cardio.id}`).expect(204);

    expect(await sessionDates(agent)).toEqual([]);
  });

  it("stays when it carries a note", async () => {
    const agent = await signedIn(alice);
    const set = await logSet(agent);
    await pool.query(`UPDATE ${T.workoutSessions} SET notes = 'Felt strong' WHERE id = $1`, [set.session_id]);

    await agent.delete(`/api/workouts/sets/${set.id}`).expect(204);

    expect(await sessionDates(agent)).toEqual([DAY.date]);
  });

  it("can be logged into again afterwards, as a new session", async () => {
    const agent = await signedIn(alice);
    const set = await logSet(agent);
    await agent.delete(`/api/workouts/sets/${set.id}`).expect(204);

    const again = await logSet(agent);

    expect(again.session_id).not.toBe(set.session_id);
    expect(await sessionDates(agent)).toEqual([DAY.date]);
  });

  it("is never another user's: a foreign id deletes nothing and leaves their session", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    const set = await logSet(a);
    const cardio = await logCardio(a);

    await b.delete(`/api/workouts/sets/${set.id}`).expect(404);
    await b.delete(`/api/cardio/${cardio.id}`).expect(404);

    expect(await sessionDates(a)).toEqual([DAY.date]);
    const detail = await a.get(`/api/workouts/session-detail?session_id=${set.session_id}`).expect(200);
    expect(detail.body.sets).toHaveLength(1);
    expect(detail.body.cardio).toHaveLength(1);
  });
});
