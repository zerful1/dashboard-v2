import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { config, T } from "../src/config";

const app = createApp();

async function columns(table: string): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [config.DB_SCHEMA, table],
  );
  return rows.map((r) => r.column_name);
}

describe("003_nutrition", () => {
  it("adds label nutrients to foods, diary entries and CoFID", async () => {
    expect(await columns("food_items")).toEqual(
      expect.arrayContaining([
        "fibre_per_100g", "sugar_per_100g", "sat_fat_per_100g", "salt_per_100g",
        "fibre_per_serving", "sugar_per_serving", "sat_fat_per_serving", "salt_per_serving",
      ]),
    );
    expect(await columns("food_log_entries")).toEqual(
      expect.arrayContaining(["fibre_g", "sugar_g", "sat_fat_g", "salt_g"]),
    );
    expect(await columns("cofid_foods")).toEqual(
      expect.arrayContaining(["fibre_per_100g", "sugar_per_100g", "sat_fat_per_100g", "salt_per_100g"]),
    );
  });

  it("adds optional body details to profiles, within sane bounds", async () => {
    expect(await columns("profiles")).toEqual(
      expect.arrayContaining(["height_cm", "birth_year", "sex", "activity_level"]),
    );
    await request(app).post("/api/auth/register").send({ email: "a@example.com", password: "correct-horse-9" });

    // Negative: the CHECKs reject nonsense...
    await expect(pool.query(`UPDATE ${T.profiles} SET height_cm = 90`)).rejects.toThrow(/check/i);
    await expect(pool.query(`UPDATE ${T.profiles} SET sex = 'other'`)).rejects.toThrow(/check/i);
    // ...positive complement: and accept a real person.
    await expect(
      pool.query(`UPDATE ${T.profiles} SET height_cm = 180, birth_year = 1996, sex = 'male', activity_level = 'moderate'`),
    ).resolves.toBeDefined();
  });
});
