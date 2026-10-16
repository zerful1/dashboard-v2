import { beforeAll, beforeEach, afterAll } from "vitest";
import { runMigrations } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { config, T } from "../src/config";

// The most important lines in this file: make it impossible for a misconfigured
// environment to point the truncation below at real data.
if (config.DB_SCHEMA !== "app_test") {
  throw new Error(
    `Refusing to run tests against schema "${config.DB_SCHEMA}" — expected app_test`,
  );
}
if (!config.isTest) {
  throw new Error(`Refusing to run tests with NODE_ENV="${config.NODE_ENV}"`);
}

beforeAll(async () => {
  // runMigrations owns and closes its own pool, so there is nothing to clean up
  // for it here — only the runtime pool is ended in afterAll.
  await runMigrations("app_test");
});

export async function truncateAll(): Promise<void> {
  // Qualified: this runs over the transaction pooler, where there is no usable
  // search_path.
  //
  // CASCADE handles the FK order for us; listing the parents would be enough,
  // but naming every table makes it obvious when a new one is forgotten.
  // cofid_foods is deliberately absent — it is global reference data, not
  // per-user state, and truncating it between tests would be wasted work.
  await pool.query(
    `TRUNCATE ${T.users}, ${T.profiles}, ${T.passwordResetTokens}, ${T.session},
              ${T.bodyWeight}, ${T.exercises},
              ${T.workoutSessions}, ${T.workoutSets}, ${T.cardioEntries},
              ${T.workoutSplit}, ${T.habits}, ${T.habitCompletions},
              ${T.nutritionTargets}, ${T.foodItems}, ${T.foodLogEntries},
              ${T.goals}
     RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});
