import { beforeAll, beforeEach, afterAll } from "vitest";
import { runMigrations } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { config, T } from "../src/config";

// The most important lines here: they stop a misconfigured environment truncating real data.
if (config.DB_SCHEMA !== "app_test") {
  throw new Error(
    `Refusing to run tests against schema "${config.DB_SCHEMA}" — expected app_test`,
  );
}
if (!config.isTest) {
  throw new Error(`Refusing to run tests with NODE_ENV="${config.NODE_ENV}"`);
}

beforeAll(async () => {
  // runMigrations owns and closes its own pool; only the runtime pool is ended in afterAll.
  await runMigrations("app_test");
});

export async function truncateAll(): Promise<void> {
  // Schema-qualified (no search_path over the pooler); CASCADE handles FK order; cofid_foods is global.
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
