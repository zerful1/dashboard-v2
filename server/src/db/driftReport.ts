import { Pool } from "pg";
import { config } from "../config";

/**
 * Read-only comparison of public (v1) against the v2 schema.
 *
 * Three questions, deliberately separated:
 *   MISSING     - in v1, not in v2 by id. The delta will insert these.
 *   EXTRA       - in v2, not in v1 by id. Logged natively in v2; nothing to do.
 *   CONFLICTING - the same logical row in both under different ids. The delta
 *                 SKIPS these, so a human has to see and judge them.
 *
 * Every date is selected as ::text. A verifier reading dates through a JS Date
 * would share the BST off-by-one it exists to rule out.
 */

const V1_USER = `(SELECT user_id FROM public.workout_sets GROUP BY 1 ORDER BY count(*) DESC LIMIT 1)`;

interface Spec {
  label: string;
  v1: string;
  v2: string;
  /** Compares the natural key between alias a (v2) and b (v1). */
  naturalKey: string | null;
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
  { label: "workout_split", v1: "workout_split", v2: "workout_split", naturalKey: null },
];

async function main(): Promise<void> {
  const schema = config.DB_SCHEMA;
  const pool = new Pool({ connectionString: config.MIGRATION_DATABASE_URL, max: 1 });
  const c = await pool.connect();
  let conflicts = 0;

  try {
    const counts: Record<string, unknown>[] = [];

    for (const t of TABLES) {
      const one = async (sql: string) => Number((await c.query<{ n: string }>(sql)).rows[0]!.n);

      // workout_split has no id column; it is keyed by user_id.
      const idCol = t.label === "workout_split" ? "user_id" : "id";

      const v1n = await one(`SELECT count(*) n FROM public.${t.v1} WHERE user_id = ${V1_USER}`);
      const v2n = await one(`SELECT count(*) n FROM "${schema}".${t.v2}`);
      const missing = await one(
        `SELECT count(*) n FROM public.${t.v1} b
          WHERE b.user_id = ${V1_USER}
            AND b.${idCol} NOT IN (SELECT ${idCol} FROM "${schema}".${t.v2})`,
      );
      const extra = await one(
        `SELECT count(*) n FROM "${schema}".${t.v2} a
          WHERE a.${idCol} NOT IN (SELECT ${idCol} FROM public.${t.v1})`,
      );

      let conflicting = 0;
      if (t.naturalKey) {
        // Same natural key, different id: one logical row recorded twice.
        conflicting = await one(
          `SELECT count(*) n
             FROM "${schema}".${t.v2} a
             JOIN public.${t.v1} b ON ${t.naturalKey}
            WHERE b.user_id = ${V1_USER} AND a.id <> b.id`,
        );
        conflicts += conflicting;
      }

      counts.push({ table: t.label, v1: v1n, v2: v2n, missing, extra, conflicting });
    }

    console.table(counts);

    if (conflicts > 0) {
      console.log("\nCONFLICTING ROWS - the delta will SKIP these. Review each:\n");

      const bw = await c.query(
        `SELECT b.date::text AS date, b.weight_kg::float8 AS v1_kg, a.weight_kg::float8 AS v2_kg,
                (b.weight_kg = a.weight_kg) AS identical
           FROM "${schema}".body_weight a
           JOIN public.body_weight b ON a.date = b.date
          WHERE b.user_id = ${V1_USER} AND a.id <> b.id
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
          WHERE b.user_id = ${V1_USER} AND a.id <> b.id
          ORDER BY b.date DESC`,
      );
      if (ws.rows.length) {
        console.log("workout_sessions:");
        console.table(ws.rows);
      }
    }

    console.log(
      conflicts === 0
        ? "\nNo conflicting rows. A delta import is safe to run unattended."
        : `\n${conflicts} conflicting row(s). The delta keeps the v2 value and discards v1's.`,
    );

    // Non-zero on conflicts, so this cannot be scripted past without a decision.
    process.exitCode = conflicts === 0 ? 0 : 2;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
