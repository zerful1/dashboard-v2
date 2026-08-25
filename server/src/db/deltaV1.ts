import { Pool } from "pg";
import { config } from "../config";
import { V1_USER_SQL, JUNK_SET_RULE } from "./v1Source";

/**
 * Re-copies anything v1 has accumulated since the Phase 3 migration.
 *
 * Safe to run repeatedly. Every statement ends in a bare `ON CONFLICT DO
 * NOTHING` - deliberately with NO conflict target - so it skips on a
 * primary-key collision (already migrated) AND on a natural-key collision (the
 * same logical row later logged in v2 under a new id). Naming one constraint
 * would abort the transaction on the other, and both have occurred:
 * 2026-08-16's weigh-in exists in v1 and v2 under different ids.
 *
 * Habits, nutrition and media are excluded by decision - barely used, and their
 * Phase 3 snapshot stands.
 *
 * JUNK_SET_RULE is applied to workout_sets. It removed nothing in Phase 3, but
 * its justification - "a mis-entry could land in the real account between now
 * and the run" - describes THIS window, not that one.
 *
 * Pure SQL, so no value passes through a JavaScript Date.
 */

function statements(schema: string): { table: string; sql: string }[] {
  const S = `"${schema}"`;
  return [
    {
      table: "body_weight",
      sql: `INSERT INTO ${S}.body_weight (id, user_id, date, weight_kg, notes, created_at)
            SELECT id, $1, date, weight_kg, notes, COALESCE(created_at, now())
              FROM public.body_weight WHERE user_id = ${V1_USER_SQL}
            ON CONFLICT DO NOTHING`,
    },

    {
      table: "exercises",
      sql: `INSERT INTO ${S}.exercises (id, user_id, day_type, exercise_name, sort_order)
            SELECT id, $1, day_type, exercise_name, sort_order
              FROM public.exercises WHERE user_id = ${V1_USER_SQL}
            ON CONFLICT DO NOTHING`,
    },

    // Sessions before sets and cardio: both carry a foreign key to it.
    {
      table: "workout_sessions",
      sql: `INSERT INTO ${S}.workout_sessions (id, user_id, date, day_type, day_name, notes, created_at)
            SELECT id, $1, date, day_type, day_name, notes, COALESCE(created_at, now())
              FROM public.workout_sessions WHERE user_id = ${V1_USER_SQL}
            ON CONFLICT DO NOTHING`,
    },

    {
      table: "workout_sets",
      // Only sets whose session actually landed. A session skipped as a
      // natural-key conflict keeps its v1 id out of the schema, and its sets
      // would otherwise violate the foreign key and abort everything.
      sql: `INSERT INTO ${S}.workout_sets
              (id, user_id, session_id, exercise_name, set_number, weight_kg, reps, is_bodyweight)
            SELECT s.id, $1, s.session_id, s.exercise_name, s.set_number,
                   s.weight_kg, s.reps, s.is_bodyweight
              FROM public.workout_sets s
             WHERE s.user_id = ${V1_USER_SQL}
               AND ${JUNK_SET_RULE}
               AND EXISTS (SELECT 1 FROM ${S}.workout_sessions ws WHERE ws.id = s.session_id)
            ON CONFLICT DO NOTHING`,
    },

    {
      table: "cardio_entries",
      sql: `INSERT INTO ${S}.cardio_entries
              (id, user_id, session_id, exercise, distance_miles, duration_minutes, speed, incline, calories_burned)
            SELECT c.id, $1, c.session_id, c.exercise, c.distance_miles,
                   c.duration_minutes, c.speed, c.incline, c.calories_burned
              FROM public.cardio_sessions c
             WHERE c.user_id = ${V1_USER_SQL}
               AND EXISTS (SELECT 1 FROM ${S}.workout_sessions ws WHERE ws.id = c.session_id)
            ON CONFLICT DO NOTHING`,
    },

    {
      table: "workout_split",
      sql: `INSERT INTO ${S}.workout_split (user_id, config, updated_at)
            SELECT $1, config, updated_at
              FROM public.workout_split WHERE user_id = ${V1_USER_SQL}
            ON CONFLICT DO NOTHING`,
    },
  ];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const email = argv[argv.indexOf("--email") + 1];
  const dryRun = argv.includes("--dry-run");
  if (!argv.includes("--email") || !email || email.startsWith("--")) {
    throw new Error("Usage: npm run delta-v1 -- --email <you@example.com> [--dry-run]");
  }

  const schema = config.DB_SCHEMA;
  if (schema === "app_test") throw new Error("Refusing to run against app_test");

  const pool = new Pool({ connectionString: config.MIGRATION_DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM "${schema}".users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    const target = rows[0]?.id;
    if (!target) throw new Error(`No account with email ${email} in schema "${schema}"`);

    console.log(`target : ${email} -> ${target} in "${schema}"`);
    console.log(dryRun ? "mode   : DRY RUN (rolled back)\n" : "mode   : COMMIT\n");

    await client.query("BEGIN");
    let inserted = 0;
    for (const { table, sql } of statements(schema)) {
      const res = await client.query(sql, [target]);
      console.log(`  ${table.padEnd(20)} +${String(res.rowCount).padStart(4)}`);
      inserted += res.rowCount ?? 0;
    }
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");

    console.log(`\n${inserted} new row(s) ${dryRun ? "would be inserted. Rolled back." : "inserted."}`);
    if (inserted === 0) console.log("v2 was already current.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
