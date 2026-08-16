import { Pool } from "pg";
import { config } from "../config";

/**
 * One-off migration of the v1 app's data from `public` into the v2 schema.
 *
 * Pure SQL by design. Both schemas live in the same database, so every row moves
 * with INSERT … SELECT and no value is ever converted to a JavaScript type. That
 * matters most for `date`: node-pg parses a date into a JS Date at local
 * midnight, which during BST serialises back as the previous day — so a
 * JavaScript round trip would shift roughly half this history by one day and
 * leave the rest correct. SQL cannot hit that.
 *
 * Original UUIDs are preserved. Only user_id is rewritten, so every foreign key
 * survives without a remapping table.
 *
 * `public` is never written to. It is the rollback path and the v1 app is still
 * deployed against it.
 */

// The real v1 account: the user_id owning 991 of the 993 workout_sets. The other
// two ids in `public` are abandoned accounts — one holds only a seeded exercise
// template, the other that plus 3 sessions and 2 sets. Determined by profiling
// on 2026-08-15; see the plan's facts table.
const V1_USER_ID = process.env.V1_USER_ID ?? "";

/**
 * A prospective guard, not a filter that currently removes anything.
 *
 * The plan described this as excluding one junk row — `Lat Pulldown 777 kg x 77
 * reps` — from the migrating account. It does not: that row belongs to the
 * abandoned account 69ee23ec…, so it is already excluded by the user_id filter.
 * The migrating account's 991 sets are all plausible (max 120 kg, max 22 reps).
 *
 * The rule stays because v1 is still deployed and still being logged to, so a
 * mis-entry could land in the real account between now and the run. verifyV1
 * asserts it excluded exactly zero rows: a filter that silently shrinks a
 * migration is invisible in a row count, so its inertness is a checked fact
 * rather than a claim in a comment.
 */
const JUNK_SET_RULE = "NOT (weight_kg > 300 OR reps > 50)";

interface Args {
  email: string;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const email = argv[argv.indexOf("--email") + 1];
  if (!argv.includes("--email") || !email || email.startsWith("--")) {
    throw new Error("Usage: npm run import-v1 -- --email <you@example.com> [--dry-run] [--force]");
  }
  return { email, dryRun: argv.includes("--dry-run"), force: argv.includes("--force") };
}

/**
 * Ordered so every foreign key target exists before its referent:
 * sessions before sets and cardio, habits before completions, food_items
 * before food_log_entries, media before media_seasons.
 */
function statements(schema: string): { table: string; sql: string }[] {
  const S = `"${schema}"`;
  return [
    {
      table: "body_weight",
      sql: `INSERT INTO ${S}.body_weight (id, user_id, date, weight_kg, notes, created_at)
            SELECT id, $1, date, weight_kg, notes, COALESCE(created_at, now())
            FROM public.body_weight WHERE user_id = $2`,
    },
    {
      table: "progress_photos",
      sql: `INSERT INTO ${S}.progress_photos (id, user_id, storage_path, date, weight_kg, notes, created_at)
            SELECT id, $1, storage_path, date, weight_kg, notes, COALESCE(created_at, now())
            FROM public.progress_photos WHERE user_id = $2`,
    },
    {
      table: "exercises",
      sql: `INSERT INTO ${S}.exercises (id, user_id, day_type, exercise_name, sort_order)
            SELECT id, $1, day_type, exercise_name, sort_order
            FROM public.exercises WHERE user_id = $2`,
    },
    {
      table: "workout_sessions",
      sql: `INSERT INTO ${S}.workout_sessions (id, user_id, date, day_type, day_name, notes, created_at)
            SELECT id, $1, date, day_type, day_name, notes, COALESCE(created_at, now())
            FROM public.workout_sessions WHERE user_id = $2`,
    },
    {
      table: "workout_sets",
      // The guard lives here rather than in a CHECK: 777 kg is a valid data
      // shape, just not a real lift. See JUNK_SET_RULE — it removes nothing
      // today, and verifyV1 asserts that.
      sql: `INSERT INTO ${S}.workout_sets (id, user_id, session_id, exercise_name, set_number, weight_kg, reps, is_bodyweight)
            SELECT id, $1, session_id, exercise_name, set_number, weight_kg, reps, is_bodyweight
            FROM public.workout_sets WHERE user_id = $2 AND ${JUNK_SET_RULE}`,
    },
    {
      table: "cardio_entries",
      sql: `INSERT INTO ${S}.cardio_entries (id, user_id, session_id, exercise, distance_miles, duration_minutes, speed, incline, calories_burned)
            SELECT id, $1, session_id, exercise, distance_miles, duration_minutes, speed, incline, calories_burned
            FROM public.cardio_sessions WHERE user_id = $2`,
    },
    {
      table: "workout_split",
      sql: `INSERT INTO ${S}.workout_split (user_id, config, updated_at)
            SELECT $1, config, updated_at
            FROM public.workout_split WHERE user_id = $2`,
    },
    {
      table: "habits",
      sql: `INSERT INTO ${S}.habits (id, user_id, name, emoji, sort_order, created_at)
            SELECT id, $1, name, emoji, sort_order, COALESCE(created_at, now())
            FROM public.habits WHERE user_id = $2`,
    },
    {
      table: "habit_completions",
      sql: `INSERT INTO ${S}.habit_completions (id, user_id, habit_id, completed_date)
            SELECT id, $1, habit_id, completed_date
            FROM public.habit_completions WHERE user_id = $2`,
    },
    {
      table: "nutrition_targets",
      sql: `INSERT INTO ${S}.nutrition_targets (id, user_id, effective_from, goal_mode, calories, protein_g, fat_g, carbs_g, created_at)
            SELECT id, $1, effective_from, goal_mode, calories, protein_g, fat_g, carbs_g, created_at
            FROM public.nutrition_targets WHERE user_id = $2`,
    },
    {
      table: "food_items",
      // 'usda' is retired in v2's CHECK. The real account has none, but the
      // rewrite makes this safe to rerun against any v1 database.
      sql: `INSERT INTO ${S}.food_items (id, user_id, name, brand, serving_description, serving_grams,
                 kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving,
                 kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
                 is_favourite, external_source, external_id, barcode, created_at)
            SELECT id, $1, name, brand, serving_description, serving_grams,
                 kcal_per_serving, protein_per_serving, fat_per_serving, carbs_per_serving,
                 kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
                 is_favourite,
                 CASE WHEN external_source = 'usda' THEN 'off' ELSE external_source END,
                 external_id, barcode, created_at
            FROM public.food_items WHERE user_id = $2`,
    },
    {
      table: "food_log_entries",
      sql: `INSERT INTO ${S}.food_log_entries (id, user_id, date, logged_at, food_item_id, name, quantity, unit, calories, protein_g, fat_g, carbs_g)
            SELECT id, $1, date, logged_at, food_item_id, name, quantity, unit, calories, protein_g, fat_g, carbs_g
            FROM public.food_log_entries WHERE user_id = $2`,
    },
    {
      table: "media",
      sql: `INSERT INTO ${S}.media (id, user_id, type, name, status, rating, last_played, notes, created_at, updated_at, replay_dismissed)
            SELECT id, $1, type, name, status, rating, last_played, notes,
                   COALESCE(created_at, now()), COALESCE(updated_at, now()), replay_dismissed
            FROM public.media WHERE user_id = $2`,
    },
    {
      table: "media_seasons",
      sql: `INSERT INTO ${S}.media_seasons (id, user_id, media_id, season_number, episodes_watched, rating)
            SELECT id, $1, media_id, season_number, episodes_watched, rating
            FROM public.media_seasons WHERE user_id = $2 AND media_id IS NOT NULL`,
    },
  ];
}

/** Global reference data — no user_id, so it is copied wholesale, once. */
const COFID_SQL = (schema: string) =>
  `INSERT INTO "${schema}".cofid_foods (food_code, name, food_group, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g)
   SELECT food_code, name, food_group, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g
   FROM public.cofid_foods
   ON CONFLICT (food_code) DO NOTHING`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const schema = config.DB_SCHEMA;

  if (!V1_USER_ID) throw new Error("V1_USER_ID must be set in the environment");
  if (schema === "app_test") throw new Error("Refusing to import into app_test");

  const pool = new Pool({ connectionString: config.MIGRATION_DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    const { rows: users } = await client.query<{ id: string }>(
      `SELECT id FROM "${schema}".users WHERE email = $1`,
      [args.email.trim().toLowerCase()],
    );
    const target = users[0]?.id;
    if (!target) {
      throw new Error(
        `No account with email ${args.email} in schema "${schema}". Register in the app first.`,
      );
    }

    const { rows: existing } = await client.query<{ n: string }>(
      `SELECT count(*) n FROM "${schema}".workout_sets WHERE user_id = $1`,
      [target],
    );
    if (Number(existing[0]!.n) > 0 && !args.force) {
      throw new Error(
        `That account already has ${existing[0]!.n} sets. Rerunning would duplicate. Pass --force only after truncating.`,
      );
    }

    console.log(`v1 user : ${V1_USER_ID}`);
    console.log(`target  : ${args.email} -> ${target} in "${schema}"`);
    console.log(args.dryRun ? "mode    : DRY RUN (rolled back)\n" : "mode    : COMMIT\n");

    await client.query("BEGIN");

    let total = 0;
    for (const { table, sql } of statements(schema)) {
      const res = await client.query(sql, [target, V1_USER_ID]);
      console.log(`  ${table.padEnd(20)} ${String(res.rowCount).padStart(5)}`);
      total += res.rowCount ?? 0;
    }
    const cofid = await client.query(COFID_SQL(schema));
    console.log(`  ${"cofid_foods".padEnd(20)} ${String(cofid.rowCount).padStart(5)}  (reference data)`);

    if (args.dryRun) {
      await client.query("ROLLBACK");
      console.log(`\n${total} user rows would move. Rolled back.`);
    } else {
      await client.query("COMMIT");
      console.log(`\n${total} user rows migrated. Committed.`);
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
