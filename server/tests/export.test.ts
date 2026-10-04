import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { config } from "../src/config";
import { NotFound } from "../src/errors";
import { findUserByEmail } from "../src/repositories/users";
import { exportUserData } from "../src/repositories/export";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who).expect(201);
  return { agent, id: (await findUserByEmail(who.email))!.id };
}

const set = (date: string, weight_kg: number) =>
  ({ date, day_type: 3, exercise_name: "Bench Press", set_number: 1, weight_kg, reps: 8, is_bodyweight: false });

/** Alice with a weigh-in, a set (and so a session), a saved split and a goal. */
async function aliceWithData() {
  const a = await signedIn(alice);
  await a.agent.post("/api/weight").send({ date: "2026-10-01", weight_kg: 79.4 }).expect(201);
  await a.agent.post("/api/workouts/sets").send(set("2026-10-02", 80)).expect(201);
  await a.agent.put("/api/split").send(DEFAULT_SPLIT).expect(200);
  await a.agent.put("/api/goals/weight").send({ target_kg: 75 }).expect(200);
  return a;
}

describe("exportUserData", () => {
  it("holds every row the user owns and none of anyone else's", async () => {
    const a = await aliceWithData();
    const b = await signedIn(bob);
    await b.agent.post("/api/weight").send({ date: "2026-10-01", weight_kg: 90 }).expect(201);
    await b.agent.post("/api/workouts/sets").send(set("2026-10-02", 120)).expect(201);

    const file = await exportUserData(a.id);
    expect(file.tables.body_weight!.map((r) => r.weight_kg)).toEqual([79.4]);
    expect(file.tables.workout_sets!.map((r) => r.weight_kg)).toEqual([80]);
    expect(file.tables.profiles).toHaveLength(1);
    expect(file.tables.workout_split).toHaveLength(1);
    expect(file.tables.goals).toHaveLength(1);
    for (const rows of Object.values(file.tables)) {
      for (const row of rows) expect(row.user_id).toBe(a.id);
    }
  });

  // Review focus 1: the export is the user's only backup.
  it("covers every table with a user_id column, so a new table can't be left out", async () => {
    const a = await signedIn(alice);
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM information_schema.columns
        WHERE table_schema = $1 AND column_name = 'user_id'`,
      [config.DB_SCHEMA],
    );
    const expected = rows.map((r) => r.table_name).filter((t) => t !== "password_reset_tokens").sort();
    expect(expected).toHaveLength(16);
    expect(Object.keys((await exportUserData(a.id)).tables).sort()).toEqual(expected);
  });

  // Review focus 3.
  it("keeps dates as text, numbers exact, and nesting intact", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    expect(file).toMatchObject({ format: "dashboard-export", version: 1, account: { id: a.id, email: alice.email } });
    expect(file.tables.body_weight![0]).toMatchObject({ date: "2026-10-01", weight_kg: 79.4 });
    expect(file.tables.workout_sessions![0]!.date).toBe("2026-10-02");
    expect(file.tables.workout_split![0]!.config).toEqual(DEFAULT_SPLIT);
    expect(file.tables.body_weight![0]!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(file.account.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // Review focus 4.
  it("never contains a secret", async () => {
    const a = await aliceWithData();
    await request(app).post("/api/auth/forgot-password").send({ email: alice.email }).expect(204);
    const text = JSON.stringify(await exportUserData(a.id));
    expect(text).not.toMatch(/password|token_hash|argon2/i);
  });

  it("orders sets by their session's date, as they happened", async () => {
    const a = await signedIn(alice);
    await a.agent.post("/api/workouts/sets").send(set("2026-10-05", 85)).expect(201);
    await a.agent.post("/api/workouts/sets").send(set("2026-10-02", 80)).expect(201);
    const file = await exportUserData(a.id);
    expect(file.tables.workout_sets!.map((r) => r.weight_kg)).toEqual([80, 85]);
  });

  it("refuses an account that no longer exists", async () => {
    await expect(exportUserData(randomUUID())).rejects.toBeInstanceOf(NotFound);
  });
});
