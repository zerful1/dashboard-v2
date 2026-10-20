import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { RESTORED_TABLES, type RestoreCounts } from "@dashboard/shared";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { findUserByEmail } from "../src/repositories/users";
import { EXPORT_TABLE_NAMES, exportUserData } from "../src/repositories/export";
import { NOT_RESTORED, restoreUserData } from "../src/repositories/restore";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(who: typeof alice) {
  await request(app).post("/api/auth/register").send(who).expect(201);
  return (await findUserByEmail(who.email))!.id;
}

const zero = Object.fromEntries(RESTORED_TABLES.map((t) => [t, 0])) as RestoreCounts;
const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

async function weighIn(userId: string, date: string, kg: number) {
  const id = randomUUID();
  await q(`INSERT INTO ${T.bodyWeight} (id, user_id, date, weight_kg) VALUES ($1, $2, $3, $4)`, [id, userId, date, kg]);
  return id;
}

async function session(userId: string, date: string, sets: number[], dayType = 3) {
  const id = randomUUID();
  await q(`INSERT INTO ${T.workoutSessions} (id, user_id, date, day_type, day_name) VALUES ($1, $2, $3, $4, 'Push')`, [
    id,
    userId,
    date,
    dayType,
  ]);
  for (const n of sets) await addSet(userId, id, n);
  return id;
}

async function addSet(userId: string, sessionId: string, setNumber: number) {
  await q(
    `INSERT INTO ${T.workoutSets} (user_id, session_id, exercise_name, set_number, weight_kg, reps) VALUES ($1, $2, 'Bench Press', $3, 80, 8)`,
    [userId, sessionId, setNumber],
  );
}

async function habit(userId: string, ticks: string[]) {
  const id = randomUUID();
  await q(`INSERT INTO ${T.habits} (id, user_id, name, sort_order) VALUES ($1, $2, 'Stretch', 0)`, [id, userId]);
  for (const d of ticks) {
    await q(`INSERT INTO ${T.habitCompletions} (user_id, habit_id, completed_date) VALUES ($1, $2, $3)`, [userId, id, d]);
  }
  return id;
}

const count = async (ref: string, userId: string) =>
  (await q(`SELECT count(*)::int AS n FROM ${ref} WHERE user_id = $1`, [userId])).rows[0].n as number;

/** Alice with 2 weigh-ins, a session holding 3 sets, and a habit with 2 ticks. */
async function aliceWithData() {
  const id = await signedIn(alice);
  const w1 = await weighIn(id, "2026-10-01", 79.4);
  await weighIn(id, "2026-10-02", 79.1);
  const s = await session(id, "2026-10-02", [1, 2, 3]);
  const h = await habit(id, ["2026-10-01", "2026-10-02"]);
  return { id, w1, s, h };
}

describe("restoreUserData", () => {
  it("brings back a deleted weigh-in, session and habit, with their sets and ticks", async () => {
    const a = await aliceWithData();
    const before = await exportUserData(a.id);
    await q(`DELETE FROM ${T.bodyWeight} WHERE id = $1`, [a.w1]);
    await q(`DELETE FROM ${T.workoutSessions} WHERE id = $1`, [a.s]);
    await q(`DELETE FROM ${T.habits} WHERE id = $1`, [a.h]);

    const added = await restoreUserData(a.id, before.tables, { dryRun: false });
    expect(added).toEqual({ ...zero, body_weight: 1, workout_sessions: 1, workout_sets: 3, habits: 1, habit_completions: 2 });
    expect((await exportUserData(a.id)).tables).toEqual(before.tables);
  });

  it("changes nothing that's already there", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`UPDATE ${T.bodyWeight} SET weight_kg = 70 WHERE id = $1`, [a.w1]);

    expect(await restoreUserData(a.id, file.tables, { dryRun: false })).toEqual(zero);
    const { rows } = await q(`SELECT weight_kg::float AS kg FROM ${T.bodyWeight} WHERE id = $1`, [a.w1]);
    expect(rows[0].kg).toBe(70);
  });

  it("skips a weigh-in on a date the account already has", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`DELETE FROM ${T.bodyWeight} WHERE id = $1`, [a.w1]);
    await weighIn(a.id, "2026-10-01", 81);

    expect((await restoreUserData(a.id, file.tables, { dryRun: false })).body_weight).toBe(0);
    const { rows } = await q(`SELECT weight_kg::float AS kg FROM ${T.bodyWeight} WHERE user_id = $1 AND date = '2026-10-01'`, [a.id]);
    expect(rows).toEqual([{ kg: 81 }]);
  });

  it("gives a session matched by date and day type only the sets it's missing", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`DELETE FROM ${T.workoutSessions} WHERE id = $1`, [a.s]);
    const mine = await session(a.id, "2026-10-02", [1]);

    const added = await restoreUserData(a.id, file.tables, { dryRun: false });
    expect(added).toMatchObject({ workout_sessions: 0, workout_sets: 2 });
    const { rows } = await q(`SELECT set_number FROM ${T.workoutSets} WHERE session_id = $1 ORDER BY 1`, [mine]);
    expect(rows.map((r) => r.set_number)).toEqual([1, 2, 3]);
  });

  it("finds nothing missing the second time", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`DELETE FROM ${T.workoutSessions} WHERE id = $1`, [a.s]);

    await restoreUserData(a.id, file.tables, { dryRun: false });
    expect(await restoreUserData(a.id, file.tables, { dryRun: false })).toEqual(zero);
    expect(await count(T.workoutSets, a.id)).toBe(3);
  });

  it("keeps a food entry whose food is gone, with no food", async () => {
    const id = await signedIn(alice);
    const entry = (foodItemId: string | null) => ({
      id: randomUUID(),
      user_id: id,
      date: "2026-10-01",
      logged_at: "2026-10-01T08:00:00+00:00",
      food_item_id: foodItemId,
      name: "Toast",
      quantity: 1,
      unit: "serving",
      calories: 100,
      protein_g: 3,
      fat_g: 1,
      carbs_g: 18,
    });
    const nowhere = randomUUID();
    const added = await restoreUserData(id, { food_log_entries: [entry(null), entry(nowhere)] }, { dryRun: false });

    expect(added.food_log_entries).toBe(2);
    const { rows } = await q(`SELECT food_item_id FROM ${T.foodLogEntries} WHERE user_id = $1`, [id]);
    expect(rows).toEqual([{ food_item_id: null }, { food_item_id: null }]);
  });

  it("re-points a food entry to the user's copy of its food", async () => {
    const id = await signedIn(alice);
    const mine = randomUUID();
    await q(
      `INSERT INTO ${T.foodItems} (id, user_id, name, external_source, external_id) VALUES ($1, $2, 'Gala apples', 'off', '0324')`,
      [mine, id],
    );
    const theirs = randomUUID();
    const added = await restoreUserData(
      id,
      {
        food_items: [{ id: theirs, user_id: id, name: "Gala apples", external_source: "off", external_id: "0324", is_favourite: false, created_at: "2026-10-01T08:00:00+00:00" }],
        food_log_entries: [
          { id: randomUUID(), user_id: id, date: "2026-10-01", logged_at: "2026-10-01T08:00:00+00:00", food_item_id: theirs, name: "Gala apples", quantity: 1, unit: "serving", calories: 53, protein_g: 0, fat_g: 0, carbs_g: 12 },
        ],
      },
      { dryRun: false },
    );

    expect(added).toMatchObject({ food_items: 0, food_log_entries: 1 });
    const { rows } = await q(`SELECT food_item_id FROM ${T.foodLogEntries} WHERE user_id = $1`, [id]);
    expect(rows).toEqual([{ food_item_id: mine }]);
  });

  it("drops a child whose parent isn't the user's", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    const bobsSession = await session(b, "2026-10-02", []);
    const bobsHabit = await habit(b, []);

    const added = await restoreUserData(
      a,
      {
        workout_sets: [{ id: randomUUID(), user_id: a, session_id: bobsSession, exercise_name: "Bench Press", set_number: 1, weight_kg: 80, reps: 8, is_bodyweight: false }],
        habit_completions: [{ id: randomUUID(), user_id: a, habit_id: bobsHabit, completed_date: "2026-10-02" }],
      },
      { dryRun: false },
    );

    expect(added).toEqual(zero);
    expect(await count(T.workoutSets, b)).toBe(0);
    expect(await count(T.habitCompletions, b)).toBe(0);
    expect(await count(T.workoutSets, a)).toBe(0);
  });

  // Safe only because the insert never updates on a clash: a "refresh edited rows"
  // change (DO UPDATE) would rewrite Bob's rows from Alice's file. This fails first.
  it("leaves another user's row alone when the file names its id", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    const bobsWeighIn = await weighIn(b, "2026-10-01", 90);
    const bobsSession = await session(b, "2026-10-02", [1]);
    const alicesSession = await session(a, "2026-10-02", []);
    const at = "2026-10-02T08:00:00+00:00";

    const added = await restoreUserData(
      a,
      {
        body_weight: [{ id: bobsWeighIn, user_id: a, date: "2026-10-05", weight_kg: 50, notes: null, created_at: at }],
        // Bob's id, on a date and day type Alice has too: its set goes to Alice's own session.
        workout_sessions: [{ id: bobsSession, user_id: a, date: "2026-10-02", day_type: 3, day_name: "Push", notes: null, created_at: at }],
        workout_sets: [{ id: randomUUID(), user_id: a, session_id: bobsSession, exercise_name: "Bench Press", set_number: 2, weight_kg: 80, reps: 8, is_bodyweight: false }],
      },
      { dryRun: false },
    );

    expect(added).toEqual({ ...zero, workout_sets: 1 });
    const bobs = await q(`SELECT user_id, date::text, weight_kg::float AS kg FROM ${T.bodyWeight} WHERE id = $1`, [bobsWeighIn]);
    expect(bobs.rows).toEqual([{ user_id: b, date: "2026-10-01", kg: 90 }]);
    expect((await q(`SELECT user_id FROM ${T.workoutSessions} WHERE id = $1`, [bobsSession])).rows).toEqual([{ user_id: b }]);
    expect(await count(T.workoutSets, b)).toBe(1);
    expect((await q(`SELECT count(*)::int AS n FROM ${T.workoutSets} WHERE session_id = $1`, [alicesSession])).rows[0].n).toBe(1);
  });

  it("rewrites user_id, whatever the file says", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    await restoreUserData(a, { body_weight: [{ id: randomUUID(), user_id: b, date: "2026-10-01", weight_kg: 80, notes: null, created_at: "2026-10-01T08:00:00+00:00" }] }, { dryRun: false });
    expect(await count(T.bodyWeight, a)).toBe(1);
    expect(await count(T.bodyWeight, b)).toBe(0);
  });

  it("writes nothing on a dry run, and returns the same counts", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`DELETE FROM ${T.workoutSessions} WHERE id = $1`, [a.s]);

    const preview = await restoreUserData(a.id, file.tables, { dryRun: true });
    expect(preview).toMatchObject({ workout_sessions: 1, workout_sets: 3 });
    expect(await count(T.workoutSessions, a.id)).toBe(0);
    expect(await restoreUserData(a.id, file.tables, { dryRun: false })).toEqual(preview);
  });

  it("rolls back everything when one row is bad", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`DELETE FROM ${T.bodyWeight} WHERE id = $1`, [a.w1]);
    await q(`DELETE FROM ${T.workoutSessions} WHERE id = $1`, [a.s]);
    file.tables.workout_sets![0]!.reps = 0;

    await expect(restoreUserData(a.id, file.tables, { dryRun: false })).rejects.toMatchObject({ code: expect.stringMatching(/^23/) });
    expect(await count(T.bodyWeight, a.id)).toBe(1);
  });

  // Their old sort_order would tie with a habit added since (Floss and Walk, both 3).
  it("puts restored habits after the account's own, in the file's order", async () => {
    const id = await signedIn(alice);
    const add = (name: string, sort: number) =>
      q(`INSERT INTO ${T.habits} (user_id, name, sort_order) VALUES ($1, $2, $3)`, [id, name, sort]);
    await add("Read", 1);
    await add("Stretch", 2);
    await add("Floss", 3);
    const file = await exportUserData(id);
    await q(`DELETE FROM ${T.habits} WHERE user_id = $1 AND name <> 'Stretch'`, [id]);
    await add("Walk", 3);

    expect((await restoreUserData(id, file.tables, { dryRun: false })).habits).toBe(2);
    const { rows } = await q(`SELECT name, sort_order FROM ${T.habits} WHERE user_id = $1 ORDER BY sort_order, created_at`, [id]);
    expect(rows.map((r) => r.name)).toEqual(["Stretch", "Walk", "Read", "Floss"]);
    expect(new Set(rows.map((r) => r.sort_order)).size).toBe(4);
  });

  it("ignores table keys it doesn't know", async () => {
    const a = await aliceWithData();
    const file = await exportUserData(a.id);
    await q(`DELETE FROM ${T.bodyWeight} WHERE id = $1`, [a.w1]);
    const added = await restoreUserData(a.id, { ...file.tables, media: [{ id: randomUUID(), title: "x" }], progress_photos: [] }, { dryRun: false });
    expect(added).toEqual({ ...zero, body_weight: 1 });
  });

  // A new exported table fails here until someone decides whether restore brings it back.
  it("splits every exported table into restored or not restored", () => {
    expect([...RESTORED_TABLES, ...NOT_RESTORED].sort()).toEqual([...EXPORT_TABLE_NAMES].sort());
  });
});
