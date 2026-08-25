import { Pool } from "pg";
import { config } from "../config";
import { resolveV1UserId, JUNK_SET_RULE } from "./v1Source";

/**
 * NOTE (post-cutover, 2026-08-25): this is a DRIFT METER, not a correctness
 * check.
 *
 * Count mismatches against `public` are now expected and meaningless - v1 is
 * frozen and v2 has moved on. Only the content checks still mean anything:
 * date ranges, total volume, distinct exercise names. Read it that way, or it
 * will look like a permanently failing migration.
 *
 * Compares the migrated data against `public` row for row.
 *
 * Every date is selected as ::text. Reading a `date` into JavaScript would
 * reintroduce exactly the BST off-by-one this migration was designed to avoid,
 * and a verifier that shares the bug it is verifying is worse than none.
 */

interface Row {
  check: string;
  v1: string;
  v2: string;
  ok: boolean;
}

async function main(): Promise<void> {
  const email = process.argv[process.argv.indexOf("--email") + 1];
  if (!email) throw new Error("Usage: npm run verify-v1 -- --email <you@example.com>");

  const schema = config.DB_SCHEMA;
  const pool = new Pool({ connectionString: config.MIGRATION_DATABASE_URL, max: 1 });
  const c = await pool.connect();
  const results: Row[] = [];

  try {
    const { rows: u } = await c.query<{ id: string }>(
      `SELECT id FROM "${schema}".users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    const target = u[0]?.id;
    if (!target) throw new Error(`No account with email ${email}`);

    // Derived from the data, not an environment variable: the v1 account is the
    // one owning the most sets. An env var here was a step that could be
    // forgotten, and forgetting it stopped this script running at all.
    const v1User = await resolveV1UserId(c);
    console.log(`v1 account: ${v1User}`);
    console.log(`v2 account: ${target} in "${schema}"\n`);

    const pair = async (check: string, v1sql: string, v2sql: string) => {
      const a = await c.query(v1sql, [v1User]);
      const b = await c.query(v2sql, [target]);
      const v1 = String(Object.values(a.rows[0] ?? { v: "-" })[0]);
      const v2 = String(Object.values(b.rows[0] ?? { v: "-" })[0]);
      results.push({ check, v1, v2, ok: v1 === v2 });
    };

    // Counts. workout_sets applies the same junk rule on both sides so the
    // comparison is fair whether or not the rule ever excludes anything.
    for (const [name, v1t, v2t] of [
      ["body_weight", "body_weight", "body_weight"],
      ["exercises", "exercises", "exercises"],
      ["workout_sessions", "workout_sessions", "workout_sessions"],
      ["cardio", "cardio_sessions", "cardio_entries"],
      ["habits", "habits", "habits"],
      ["habit_completions", "habit_completions", "habit_completions"],
      ["nutrition_targets", "nutrition_targets", "nutrition_targets"],
      ["food_items", "food_items", "food_items"],
      ["food_log_entries", "food_log_entries", "food_log_entries"],
      ["media", "media", "media"],
    ] as const) {
      await pair(
        `count ${name}`,
        `SELECT count(*)::int FROM public.${v1t} WHERE user_id = $1`,
        `SELECT count(*)::int FROM "${schema}".${v2t} WHERE user_id = $1`,
      );
    }

    await pair(
      "count workout_sets (guard applied)",
      `SELECT count(*)::int FROM public.workout_sets WHERE user_id = $1 AND ${JUNK_SET_RULE}`,
      `SELECT count(*)::int FROM "${schema}".workout_sets WHERE user_id = $1`,
    );

    // Dates as text on both sides — the whole point of the exercise.
    await pair(
      "earliest session date",
      `SELECT min(date)::text FROM public.workout_sessions WHERE user_id = $1`,
      `SELECT min(date)::text FROM "${schema}".workout_sessions WHERE user_id = $1`,
    );
    await pair(
      "latest session date",
      `SELECT max(date)::text FROM public.workout_sessions WHERE user_id = $1`,
      `SELECT max(date)::text FROM "${schema}".workout_sessions WHERE user_id = $1`,
    );
    await pair(
      "earliest weigh-in date",
      `SELECT min(date)::text FROM public.body_weight WHERE user_id = $1`,
      `SELECT min(date)::text FROM "${schema}".body_weight WHERE user_id = $1`,
    );

    // BST-dated rows specifically — the case a JS round trip would have shifted.
    await pair(
      "count sessions in BST months",
      `SELECT count(*)::int FROM public.workout_sessions
        WHERE user_id = $1 AND extract(month from date) BETWEEN 4 AND 9`,
      `SELECT count(*)::int FROM "${schema}".workout_sessions
        WHERE user_id = $1 AND extract(month from date) BETWEEN 4 AND 9`,
    );

    // Content, not just cardinality.
    await pair(
      "total reps across all sets",
      `SELECT sum(reps)::int FROM public.workout_sets WHERE user_id = $1 AND ${JUNK_SET_RULE}`,
      `SELECT sum(reps)::int FROM "${schema}".workout_sets WHERE user_id = $1`,
    );
    await pair(
      "total volume (kg x reps)",
      `SELECT round(sum(weight_kg * reps))::int FROM public.workout_sets WHERE user_id = $1 AND ${JUNK_SET_RULE}`,
      `SELECT round(sum(weight_kg * reps))::int FROM "${schema}".workout_sets WHERE user_id = $1`,
    );
    // ::float8, NOT ::text. `numeric` preserves the scale it was given, so the
    // same weigh-in written by v1 and by v2 renders as '78.20' and '78.2' - two
    // different strings for one number, and a check that fails on formatting.
    await pair(
      "latest body weight",
      `SELECT weight_kg::float8 FROM public.body_weight WHERE user_id = $1 ORDER BY date DESC LIMIT 1`,
      `SELECT weight_kg::float8 FROM "${schema}".body_weight WHERE user_id = $1 ORDER BY date DESC LIMIT 1`,
    );
    await pair(
      "distinct exercise names in history",
      `SELECT count(DISTINCT exercise_name)::int FROM public.workout_sets WHERE user_id = $1 AND ${JUNK_SET_RULE}`,
      `SELECT count(DISTINCT exercise_name)::int FROM "${schema}".workout_sets WHERE user_id = $1`,
    );
    await pair(
      "distinct day_name values",
      `SELECT count(DISTINCT day_name)::int FROM public.workout_sessions WHERE user_id = $1`,
      `SELECT count(DISTINCT day_name)::int FROM "${schema}".workout_sessions WHERE user_id = $1`,
    );

    /*
     * The guard must have removed nothing.
     *
     * A filter that silently shrinks a migration is invisible in the count
     * comparisons above, because those apply the same filter to both sides —
     * they would agree just as happily if the rule had dropped fifty real
     * lifts. This is the only check that can tell. v1 is still deployed and
     * still being logged to, so if a mis-entry ever does land in the migrating
     * account, this fails loudly rather than quietly discarding a real set.
     */
    const excluded = await c.query<{ n: number }>(
      `SELECT count(*)::int n FROM public.workout_sets WHERE user_id = $1 AND NOT (${JUNK_SET_RULE})`,
      [v1User],
    );
    results.push({
      check: "guard excluded nothing",
      v1: "0",
      v2: String(excluded.rows[0]!.n),
      ok: excluded.rows[0]!.n === 0,
    });

    // Nothing matching the guard's shape reached v2 either.
    const junk = await c.query<{ n: number }>(
      `SELECT count(*)::int n FROM "${schema}".workout_sets WHERE user_id = $1 AND (weight_kg > 300 OR reps > 50)`,
      [target],
    );
    results.push({
      check: "no implausible rows in v2",
      v1: "0",
      v2: String(junk.rows[0]!.n),
      ok: junk.rows[0]!.n === 0,
    });

    // Nothing from the two abandoned accounts leaked in.
    const foreign = await c.query<{ n: number }>(
      `SELECT count(*)::int n FROM "${schema}".workout_sets WHERE user_id <> $1`,
      [target],
    );
    results.push({
      check: "no other users' rows",
      v1: "0",
      v2: String(foreign.rows[0]!.n),
      ok: foreign.rows[0]!.n === 0,
    });

    console.table(results);
    const failed = results.filter((r) => !r.ok);
    console.log(
      failed.length === 0
        ? `\nALL ${results.length} CHECKS PASS`
        : `\n${failed.length} FAILED: ${failed.map((f) => f.check).join(", ")}`,
    );
    process.exitCode = failed.length === 0 ? 0 : 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
