import { describe, it, expect } from "vitest";
import request from "supertest";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { findUserByEmail } from "../src/repositories/users";
import { getOrCreateSession } from "../src/repositories/sessions";

const app = createApp();

describe("004_unilateral_sets", () => {
  it("holds both sides or neither, and counts the lower side", async () => {
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: "correct-horse-9" });
    const userId = (await findUserByEmail("a@example.com"))!.id;
    const session = await getOrCreateSession(userId, "2026-08-24", 2, DEFAULT_SPLIT);
    let setNumber = 0;
    const insert = (reps: number, left: number | null, right: number | null) =>
      pool.query(
        `INSERT INTO ${T.workoutSets}
           (user_id, session_id, exercise_name, set_number, weight_kg, reps, reps_left, reps_right)
         VALUES ($1, $2, 'Unilateral Curl', $3, 10, $4, $5, $6)`,
        [userId, session.id, ++setNumber, reps, left, right],
      );

    // Negative: one side alone, and a counted number that is not the lower side.
    await expect(insert(5, 6, null)).rejects.toThrow(/workout_sets_sides/);
    await expect(insert(6, 6, 5)).rejects.toThrow(/workout_sets_sides/);
    // Positive complement: a single-sided set, equal sides, and a plain set.
    await expect(insert(5, 6, 5)).resolves.toBeDefined();
    await expect(insert(8, 8, 8)).resolves.toBeDefined();
    await expect(insert(7, null, null)).resolves.toBeDefined();
  });
});
