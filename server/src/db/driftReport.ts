import { Pool } from "pg";
import { config } from "../config";
import { V1_USER_SQL } from "./v1Source";

/**
 * Read-only comparison of public (v1) against the v2 schema.
 *
 * Four questions, deliberately separated:
 *   MISSING     - in v1, not in v2 by id. The delta will insert these.
 *   EXTRA       - in v2, not in v1 by id. Logged natively in v2; nothing to do.
 *   CONFLICTING - the same logical row in both under different ids. The delta
 *                 SKIPS these, so a human has to see and judge them.
 *   UNACCOUNTED - missing minus conflicting. THE GATE.
 *
 * `missing` is not the gate and never could have been. It measures "every v1 id
 * is present in v2", but a row the delta correctly skips as a natural-key
 * conflict stays missing-by-id permanently — 2026-08-16's weigh-in exists in v1
 * under an id v2 will never hold. The quantity that actually gates a cutover is
 * "every v1 row is accounted for", which is missing minus conflicting.
 *
 * Every date is selected as ::text. A verifier reading dates through a JS Date
 * would share the BST off-by-one it exists to rule out.
 */

interface Spec {
  label: string;
  v1: string;
  v2: string;
  /** Compares the natural key between alias a (v2) and b (v1). */
  naturalKey: string | null;
  /**
   * Report row counts only, with no id comparison.
   *
   * workout_split has no `id`; it is keyed by user_id — and v1's user_id and
   * v2's differ BY DESIGN, since rewriting it is the entire point of the
   * migration. Comparing them would report a permanent drift that is not one
   * the moment either side is non-empty.
   */
  countsOnly?: boolean;
}

const TABLES: Spec[] = [
  {
    label: "body_weight",
    v1: "body_weight",
    v2: "body_weight",
    naturalKey: "a.date = b.date",
  },
  {
    label: "workout_sessions",
    v1: "workout_sessions",
    v2: "workout_sessions",
    naturalKey: "a.date = b.date AND a.day_type = b.day_type",
  },
  {
    label: "workout_sets",
    v1: "workout_sets",
    v2: "workout_sets",
    naturalKey:
      "a.session_id = b.session_id AND a.exercise_name = b.exercise_name AND a.set_number = b.set_number",
  },
  { label: "cardio_entries", v1: "cardio_sessions", v2: "cardio_entries", naturalKey: null },
  { label: "exercises", v1: "exercises", v2: "exercises", naturalKey: null },
  {
    label: "workout_split",
    v1: "workout_split",
    v2: "workout_split",
    naturalKey: null,
    countsOnly: true,
  },
];

async function main(): Promise<void> {
  const schema = config.DB_SCHEMA;
  const pool = new Pool({ connectionString: config.MIGRATION_DATABASE_URL, max: 1 });
  const c = await pool.connect();
  let conflicts = 0;
  let unaccountedTotal = 0;

  try {
    const counts: Record<string, unknown>[] = [];

    for (const t of TABLES) {
      const one = async (sql: string) => Number((await c.query<{ n: string }>(sql)).rows[0]!.n);

      const v1n = await one(`SELECT count(*) n FROM public.${t.v1} WHERE user_id = ${V1_USER_SQL}`);
      const v2n = await one(`SELECT count(*) n FROM "${schema}".${t.v2}`);

      if (t.countsOnly) {
        counts.push({
          table: t.label,
          v1: v1n,
          v2: v2n,
          missing: "-",
          extra: "-",
          conflicting: "-",
          unaccounted: "-",
        });
        continue;
      }

      const missing = await one(
        `SELECT count(*) n FROM public.${t.v1} b
          WHERE b.user_id = ${V1_USER_SQL}
            AND b.id NOT IN (SELECT id FROM "${schema}".${t.v2})`,
      );
      const extra = await one(
        `SELECT count(*) n FROM "${schema}".${t.v2} a
          WHERE a.id NOT IN (SELECT id FROM public.${t.v1})`,
      );

      let conflicting = 0;
      if (t.naturalKey) {
        // Same natural key, different id: one logical row recorded twice.
        conflicting = await one(
          `SELECT count(*) n
             FROM "${schema}".${t.v2} a
             JOIN public.${t.v1} b ON ${t.naturalKey}
            WHERE b.user_id = ${V1_USER_SQL} AND a.id <> b.id`,
        );
        conflicts += conflicting;
      }

      const unaccounted = missing - conflicting;
      unaccountedTotal += unaccounted;

      counts.push({ table: t.label, v1: v1n, v2: v2n, missing, extra, conflicting, unaccounted });
    }

    console.table(counts);

    if (conflicts > 0) {
      console.log("\nCONFLICTING ROWS - the delta will SKIP these. Review each:\n");

      const bw = await c.query(
        `SELECT b.date::text AS date, b.weight_kg::float8 AS v1_kg, a.weight_kg::float8 AS v2_kg,
                (b.weight_kg = a.weight_kg) AS identical
           FROM "${schema}".body_weight a
           JOIN public.body_weight b ON a.date = b.date
          WHERE b.user_id = ${V1_USER_SQL} AND a.id <> b.id
          ORDER BY b.date DESC`,
      );
      if (bw.rows.length) {
        console.log("body_weight:");
        console.table(bw.rows);
      }

      const ws = await c.query(
        `SELECT b.date::text AS date, b.day_type, b.day_name AS v1_name, a.day_name AS v2_name
           FROM "${schema}".workout_sessions a
           JOIN public.workout_sessions b ON a.date = b.date AND a.day_type = b.day_type
          WHERE b.user_id = ${V1_USER_SQL} AND a.id <> b.id
          ORDER BY b.date DESC`,
      );
      if (ws.rows.length) {
        console.log("workout_sessions:");
        console.table(ws.rows);
      }
    }

    if (unaccountedTotal === 0) {
      console.log(
        conflicts === 0
          ? "\nunaccounted: 0 everywhere. v2 holds every v1 row."
          : `\nunaccounted: 0 everywhere. v2 holds every v1 row; ${conflicts} of them ` +
              `under a v2 id rather than v1's, listed above.`,
      );
    } else {
      console.log(
        `\n${unaccountedTotal} UNACCOUNTED row(s): in v1, not in v2, and not explained ` +
          `by a conflict. Run the delta.`,
      );
    }

    // The gate is unaccounted, not conflicts. A conflict is a row v2 already
    // holds under its own id, which is not a reason to block a cutover.
    process.exitCode = unaccountedTotal === 0 ? 0 : 2;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
