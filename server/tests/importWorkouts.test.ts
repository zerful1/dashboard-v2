import { describe, it, expect } from "vitest";
import request from "supertest";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { findUserByEmail } from "../src/repositories/users";
import { getOrCreateSession } from "../src/repositories/sessions";
import { upsertSet } from "../src/repositories/sets";
import { saveSplit } from "../src/repositories/split";
import { ImportConflict, parseArgs, runImport } from "../src/db/importWorkouts";
import type { SheetWorkout } from "../src/db/workoutSheetParse";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
const SCHEMA = "app_test";

async function userId(who: typeof alice): Promise<string> {
  await request(app).post("/api/auth/register").send(who);
  return (await findUserByEmail(who.email))!.id;
}

type Row = [exercise: string, set: number, kg: number, reps: number, sides?: [left: number, right: number]];
const workout = (date: string, day: string, sets: Row[], withCardio = false): SheetWorkout => ({
  date,
  day_name: day,
  sets: sets.map(([exercise_name, set_number, weight_kg, reps, sides]) => ({
    exercise_name, set_number, weight_kg, reps, is_bodyweight: weight_kg === 0,
    reps_left: sides?.[0] ?? null, reps_right: sides?.[1] ?? null,
  })),
  cardio: withCardio
    ? [{ exercise: "Incline Treadmill", distance_miles: 0.17, duration_minutes: 5, speed: 3.5, incline: 15, calories_burned: 40 }]
    : [],
});

/** An existing dashboard session, logged the way the app logs one. */
async function logged(user: string, date: string, dayType: number, sets: Row[]) {
  const s = await getOrCreateSession(user, date, dayType, DEFAULT_SPLIT);
  for (const [exerciseName, setNumber, weightKg, reps] of sets) {
    await upsertSet(user, { sessionId: s.id, exerciseName, setNumber, weightKg, reps, isBodyweight: false });
  }
  return s;
}

async function rows(user: string) {
  const sessions = await pool.query(
    `SELECT date::text, day_type, day_name FROM ${T.workoutSessions} WHERE user_id = $1 ORDER BY date`,
    [user],
  );
  const sets = await pool.query(
    `SELECT s.date::text, w.exercise_name, w.set_number, w.weight_kg::float8 AS kg, w.reps, w.is_bodyweight
       FROM ${T.workoutSets} w JOIN ${T.workoutSessions} s ON s.id = w.session_id
      WHERE w.user_id = $1 ORDER BY s.date, w.exercise_name, w.set_number`,
    [user],
  );
  const cardio = await pool.query(`SELECT exercise FROM ${T.cardioEntries} WHERE user_id = $1`, [user]);
  return { sessions: sessions.rows, sets: sets.rows, cardio: cardio.rows };
}

describe("runImport", () => {
  it("adds a new session with its sets and cardio, on the day type from the user's own split", async () => {
    const a = await userId(alice);
    // Not the default numbering, so a test passing on DEFAULT_SPLIT proves nothing.
    await saveSplit(a, { days: [{ day_type: 7, label: "Upper" }], week: [7, "rest", "rest", "rest", "rest", "rest", "rest"] });

    const report = await runImport(SCHEMA, a, [workout("2026-06-19", "upper", [["T Bar Row", 1, 30, 9], ["Pull Ups", 1, 0, 5]], true)], { apply: true });

    expect(report).toMatchObject({ newSessions: 1, setsAdded: 2, cardioAdded: 1 });
    const r = await rows(a);
    // The split's spelling is what the history keeps.
    expect(r.sessions).toEqual([{ date: "2026-06-19", day_type: 7, day_name: "Upper" }]);
    expect(r.sets).toEqual([
      { date: "2026-06-19", exercise_name: "Pull Ups", set_number: 1, kg: 0, reps: 5, is_bodyweight: true },
      { date: "2026-06-19", exercise_name: "T Bar Row", set_number: 1, kg: 30, reps: 9, is_bodyweight: false },
    ]);
    expect(r.cardio).toEqual([{ exercise: "Incline Treadmill" }]);
  });

  it("writes nothing on a dry run, and reports what it would do", async () => {
    const a = await userId(alice);
    const report = await runImport(SCHEMA, a, [workout("2026-06-19", "Pull", [["T Bar Row", 1, 30, 9]], true)], { apply: false });
    expect(report).toMatchObject({ newSessions: 1, setsAdded: 1, cardioAdded: 1 });
    expect(await rows(a)).toEqual({ sessions: [], sets: [], cardio: [] });
  });

  // 25 June and 24 July are in the dashboard already, but only partly.
  it("fills in what a session is missing, and a second run adds nothing", async () => {
    const a = await userId(alice);
    await logged(a, "2026-06-25", 2, [["T Bar Row", 1, 30, 8], ["T Bar Row", 2, 30, 8]]);
    const sheet = [workout("2026-06-25", "Pull", [["T Bar Row", 1, 30, 8], ["T Bar Row", 2, 30, 8], ["Reverse Curl", 1, 7.9, 8]], true)];

    expect(await runImport(SCHEMA, a, sheet, { apply: true })).toMatchObject({
      newSessions: 0, filledSessions: 1, setsAdded: 1, setsAlreadyThere: 2, cardioAdded: 1,
    });
    expect(await runImport(SCHEMA, a, sheet, { apply: true })).toMatchObject({
      newSessions: 0, filledSessions: 0, unchangedSessions: 1, setsAdded: 0, setsAlreadyThere: 3,
      cardioAdded: 0, cardioAlreadyThere: 1,
    });
    const r = await rows(a);
    expect(r.sessions).toHaveLength(1);
    expect(r.sets.map((s) => `${s.exercise_name} ${s.set_number}`)).toEqual(["Reverse Curl 1", "T Bar Row 1", "T Bar Row 2"]);
    expect(r.cardio).toHaveLength(1);
  });

  it("refuses a set that disagrees with the dashboard, and writes nothing at all", async () => {
    const a = await userId(alice);
    await logged(a, "2026-06-25", 2, [["T Bar Row", 1, 30, 8]]);
    const sheet = [
      workout("2026-06-19", "Upper", [["Lat Pulldown", 1, 61.2, 6]]),
      workout("2026-06-25", "Pull", [["T Bar Row", 1, 30, 9]]),
    ];

    const err = await runImport(SCHEMA, a, sheet, { apply: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportConflict);
    expect((err as ImportConflict).conflicts).toEqual([
      "2026-06-25 T Bar Row set 1: the dashboard has 30 kg x 8, the sheet has 30 kg x 9",
    ]);
    // Not even the session that had no conflict.
    expect((await rows(a)).sessions.map((s) => s.date)).toEqual(["2026-06-25"]);
  });

  it("imports both sides of a single-sided set, and matches them on a re-run", async () => {
    const a = await userId(alice);
    const sheet = [workout("2026-08-24", "Pull", [["Unilateral Machine Preacher Curl", 1, 17.5, 5, [6, 5]]])];
    expect(await runImport(SCHEMA, a, sheet, { apply: true })).toMatchObject({ newSessions: 1, setsAdded: 1 });
    expect(await runImport(SCHEMA, a, sheet, { apply: true })).toMatchObject({
      unchangedSessions: 1, setsAdded: 0, setsAlreadyThere: 1,
    });
    const { rows } = await pool.query(`SELECT reps, reps_left, reps_right FROM ${T.workoutSets} WHERE user_id = $1`, [a]);
    expect(rows).toEqual([{ reps: 5, reps_left: 6, reps_right: 5 }]);
  });

  // Exactly the 3 imported "a | b" sets until the rollout fills their sides in.
  it("calls a set the dashboard holds without sides a conflict when the sheet has them", async () => {
    const a = await userId(alice);
    await logged(a, "2026-08-24", 2, [["Reverse Curl", 1, 12.5, 4]]);
    const err = await runImport(
      SCHEMA, a, [workout("2026-08-24", "Pull", [["Reverse Curl", 1, 12.5, 4, [4, 5]]])], { apply: true },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportConflict);
    expect((err as ImportConflict).conflicts).toEqual([
      "2026-08-24 Reverse Curl set 1: the dashboard has 12.5 kg x 4, the sheet has 12.5 kg x L4 R5",
    ]);
  });

  it("refuses a day the user's split does not have", async () => {
    const a = await userId(alice);
    await expect(runImport(SCHEMA, a, [workout("2026-06-19", "Arms", [["Cable Curl", 1, 19.3, 6]])], { apply: true })).rejects.toThrow(
      /"Arms".*Legs, Pull, Push, Lower, Upper/,
    );
    expect((await rows(a)).sessions).toEqual([]);
  });
});

describe("runImport ownership scoping", () => {
  it("never fills in, compares against or touches another user's session", async () => {
    const a = await userId(alice);
    const b = await userId(bob);
    // Bob's set on the same day would be a conflict if it were ever looked at.
    await logged(b, "2026-06-25", 2, [["T Bar Row", 1, 30, 9]]);

    const report = await runImport(SCHEMA, a, [workout("2026-06-25", "Pull", [["T Bar Row", 1, 30, 8]])], { apply: true });

    expect(report).toMatchObject({ newSessions: 1, filledSessions: 0, setsAdded: 1 });
    expect((await rows(a)).sets.map((s) => s.reps)).toEqual([8]);
    expect((await rows(b)).sets.map((s) => s.reps)).toEqual([9]);
    expect((await rows(b)).sessions).toHaveLength(1);
  });
});

describe("parseArgs", () => {
  const ok = ["Workout Split.xlsx", "--email", "a@b.com", "--schema", "app_dev"];

  it("reads the file, the account, the schema and --apply", () => {
    expect(parseArgs(ok)).toEqual({ file: "Workout Split.xlsx", email: "a@b.com", schema: "app_dev", apply: false });
    expect(parseArgs([...ok, "--apply"]).apply).toBe(true);
  });

  it("needs the schema and the account named, and refuses the test and v1 schemas", () => {
    expect(() => parseArgs(["f.xlsx", "--email", "a@b.com"])).toThrow(/--schema/);
    expect(() => parseArgs(["f.xlsx", "--schema", "app_dev"])).toThrow(/--email/);
    expect(() => parseArgs(["f.xlsx", "--email", "a@b.com", "--schema", "app_test"])).toThrow(/app_test/);
    expect(() => parseArgs(["f.xlsx", "--email", "a@b.com", "--schema", "public"])).toThrow(/public/);
    expect(() => parseArgs(["f.xlsx", "--email", "a@b.com", "--schema", "app; drop"])).toThrow(/unsafe/);
  });
});
