import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { errorHandler } from "../src/middleware/errorHandler";
import { getOrCreateSession } from "../src/repositories/sessions";
import { findUserByEmail } from "../src/repositories/users";
import { isTimeZone } from "../src/routes/profile";
import { DEFAULT_SPLIT } from "@dashboard/shared";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };

async function signedIn() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(alice);
  return agent;
}

afterEach(() => vi.restoreAllMocks());

/**
 * Five routes checked a date's shape and not that the day exists, so
 * "2026-02-31" passed validation and Postgres refused it as a 500.
 */
describe("a date that doesn't exist is a 400 everywhere", () => {
  const BAD = "2026-02-31";

  it("on every route that takes one", async () => {
    const agent = await signedIn();
    const set = { day_type: 1, exercise_name: "Squat", set_number: 1, weight_kg: 100, reps: 5, is_bodyweight: false };
    const entry = { name: "Oats", quantity: 1, unit: "serving", calories: 150, protein_g: 5, fat_g: 3, carbs_g: 27 };
    const target = { goal_mode: "cut", calories: 2000, protein_g: 150, fat_g: 60, carbs_g: 200 };
    const cardio = { day_type: 1, exercise: "Treadmill" };

    // One at a time (CLAUDE.md: supertest and concurrent requests on Linux).
    for (const send of [
      () => agent.post("/api/weight").send({ date: BAD, weight_kg: 80 }),
      () => agent.post("/api/workouts/sets").send({ ...set, date: BAD }),
      () => agent.get(`/api/workouts/session?date=${BAD}&day_type=1`),
      () => agent.get(`/api/workouts/sessions?since=${BAD}`),
      () => agent.get(`/api/workouts/last-times?before=${BAD}&name=Squat`),
      () => agent.get(`/api/workouts/progress?today=${BAD}`),
      () => agent.post("/api/cardio").send({ ...cardio, date: BAD }),
      () => agent.post("/api/nutrition/diary").send({ ...entry, date: BAD }),
      () => agent.get(`/api/nutrition/diary?date=${BAD}`),
      () => agent.get(`/api/nutrition/days?from=${BAD}&to=2026-03-02`),
      () => agent.post("/api/nutrition/diary/copy").send({ from: BAD, to: "2026-03-01" }),
      () => agent.post("/api/nutrition/targets").send({ ...target, effective_from: BAD }),
      () => agent.get(`/api/nutrition/tdee?today=${BAD}`),
      () => agent.get(`/api/habits?today=${BAD}`),
      () => agent.get(`/api/insights/projections?today=${BAD}`),
    ]) {
      const res = await send();
      expect(res.status, `${res.request.method} ${res.request.url}`).toBe(400);
      expect(res.body.message).toBe("Validation failed");
    }
  });

  it("and a real date is still taken", async () => {
    // The complement: 400 for every date would pass the test above.
    const agent = await signedIn();
    await agent.post("/api/weight").send({ date: "2028-02-29", weight_kg: 80 }).expect(201);
    await agent.get("/api/nutrition/diary?date=2026-02-28").expect(200);
    await agent.get("/api/workouts/progress?today=2026-12-31").expect(200);
  });
});

describe("a value Postgres refuses is a 4xx, and says nothing the database said", () => {
  /** An app whose one route throws what pg would. */
  function throwing(err: unknown) {
    const bare = express();
    bare.get("/", (_req, _res, next) => next(err));
    bare.use(errorHandler);
    return bare;
  }
  const pgError = (code: string) =>
    Object.assign(new Error('date/time field value out of range: "2026-02-31"'), { code, severity: "ERROR" });

  it("answers 400 for a data error and 409 for a duplicate", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const bad = await request(throwing(pgError("22008"))).get("/").expect(400);
    expect(bad.body).toEqual({ error: "bad_request", message: "That can't be saved as it is" });
    const dup = await request(throwing(pgError("23505"))).get("/").expect(409);
    expect(dup.body.error).toBe("conflict");

    // Logged by code, so a validation gap is still visible, but never with
    // the message: Postgres quotes the value, and that is the user's data.
    expect(JSON.stringify(logged.mock.calls)).toContain("22008");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("2026-02-31");
  });

  it("answers a real one from the database the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = await pool.query("SELECT '2026-02-31'::date").then(
      () => null,
      (e: unknown) => e,
    );
    await request(throwing(real)).get("/").expect(400);
  });

  it("still answers 500 for anything else", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A connection failure, a missing table, a bug: not the request's fault.
    await request(throwing(Object.assign(new Error("relation does not exist"), { code: "42P01", severity: "ERROR" }))).get("/").expect(500);
    await request(throwing(new Error("boom"))).get("/").expect(500);
    // A five-character code alone is not a pg error.
    await request(throwing(Object.assign(new Error("x"), { code: "22008" }))).get("/").expect(500);
  });
});

describe("History's pages", () => {
  it("walk sessions that share a date in one fixed order: the later-made first", async () => {
    const agent = await signedIn();
    const userId = (await findUserByEmail(alice.email))!.id;
    // Six sessions on one date, so date alone can't order them. With date
    // alone their order was whatever the sort left, and could differ from one
    // page's query to the next: a session shown twice, another not at all.
    for (const dayType of [1, 2, 3, 4, 5, 6]) await getOrCreateSession(userId, "2026-08-16", dayType, DEFAULT_SPLIT);
    // Made in an order that is neither the insert order nor its reverse, so no
    // accident of storage produces it.
    const newestFirst = [4, 1, 6, 2, 5, 3];
    for (const [i, dayType] of newestFirst.entries()) {
      await pool.query(
        `UPDATE ${T.workoutSessions} SET created_at = timestamptz '2026-08-16 12:00+00' - make_interval(mins => $3)
          WHERE user_id = $1 AND day_type = $2`,
        [userId, dayType, i],
      );
    }

    const seen: number[] = [];
    for (const offset of [0, 2, 4]) {
      const page = await agent.get(`/api/workouts/sessions?limit=2&offset=${offset}`).expect(200);
      seen.push(...(page.body as { day_type: number }[]).map((s) => s.day_type));
    }

    expect(seen).toEqual(newestFirst);
  });
});

describe("profile time zone", () => {
  it("knows a zone by name, and nothing else", () => {
    for (const zone of ["Europe/London", "America/Argentina/Buenos_Aires", "UTC", "Etc/GMT+1"]) {
      expect(isTimeZone(zone), zone).toBe(true);
    }
    // An offset reads east in Intl and west in Postgres; the rest are unknown.
    for (const zone of ["+01:00", "Mars/Olympus", "London", "", "Europe/London; DROP TABLE users"]) {
      expect(isTimeZone(zone), zone).toBe(false);
    }
  });

  it("refuses an unknown zone, and takes a real one", async () => {
    const agent = await signedIn();
    const res = await agent.patch("/api/profile").send({ timezone: "Mars/Olympus" }).expect(400);
    expect(res.body.details.timezone).toBe("Unknown time zone");
    const ok = await agent.patch("/api/profile").send({ timezone: "America/New_York" }).expect(200);
    expect(ok.body.timezone).toBe("America/New_York");
  });
});
