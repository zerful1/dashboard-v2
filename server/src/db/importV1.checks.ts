import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { config } from "../config";

/**
 * Runs `importV1.checks.sql` against the live database and reports blockers.
 *
 * Read-only: every statement in that file is a SELECT. The v2 schema adds
 * constraints v1 never had, so running these first turns a mid-transaction
 * abort into a readable list of what would have failed.
 *
 * A file rather than an inline command because the checks are run twice — once
 * on their own and again immediately before the migration — and because the
 * substitution below is easy to get subtly wrong at a shell prompt.
 */

const V1_USER_ID = process.env.V1_USER_ID ?? "";

async function main(): Promise<void> {
  if (!V1_USER_ID) throw new Error("V1_USER_ID must be set in the environment");

  // Comments are stripped BEFORE splitting on ';'. Prose contains semicolons —
  // this file's own header did — and splitting first turns half a sentence into
  // a statement, which fails with a syntax error pointing at an English word.
  // Safe here because no string literal in the file contains '--'.
  //
  // psql's \set is not available over the wire, so drop it and substitute the
  // id the migration itself will use. The literal in the .sql file is therefore
  // documentation, never the value that runs.
  const sql = readFileSync(join(__dirname, "importV1.checks.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("\\set"))
    .map((line) => {
      const comment = line.indexOf("--");
      return comment === -1 ? line : line.slice(0, comment);
    })
    .join("\n")
    .replaceAll(":'v1user'", `'${V1_USER_ID}'`);

  /*
   * Positive control, part 1: the substitution actually happened.
   *
   * Every check below is a SELECT that returns rows only on failure, so a
   * checks file filtered on a uuid that matches nothing returns zero rows
   * everywhere and reports a confident all-clear. "No blockers found" and "no
   * blockers exist" are different claims, and without this they look identical.
   */
  if (sql.includes("v1user")) {
    throw new Error("Substitution failed: :'v1user' is still present in the SQL");
  }
  const substitutions = (sql.match(new RegExp(V1_USER_ID, "g")) ?? []).length;
  if (substitutions === 0) {
    throw new Error(`Substitution failed: ${V1_USER_ID} appears nowhere in the SQL`);
  }

  const client = new Client({ connectionString: config.MIGRATION_DATABASE_URL });
  await client.connect();

  let blockers = 0;
  try {
    /*
     * Positive control, part 2: the id selects a real population.
     *
     * A syntactically perfect substitution of the WRONG uuid still examines
     * nothing. Requiring the account to own rows is what turns "these checks
     * found no blockers" into "these checks looked at the data and there are
     * none".
     */
    const { rows: population } = await client.query<{ sets: number; weights: number }>(
      `SELECT (SELECT count(*)::int FROM public.workout_sets  WHERE user_id = $1) AS sets,
              (SELECT count(*)::int FROM public.body_weight   WHERE user_id = $1) AS weights`,
      [V1_USER_ID],
    );
    const { sets, weights } = population[0]!;
    if (sets === 0 && weights === 0) {
      throw new Error(
        `${V1_USER_ID} owns no workout_sets and no body_weight rows in public. ` +
          `The checks would examine nothing and report a false all-clear.`,
      );
    }
    console.log(
      `scope   : ${V1_USER_ID} (${substitutions} substitutions, ${sets} sets, ${weights} weigh-ins)`,
    );

    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.replace(/--[^\n]*/g, "").trim().length > 0);

    for (const statement of statements) {
      const result = await client.query(statement);
      if (result.rows.length > 0) {
        blockers += result.rows.length;
        console.log("BLOCKER:");
        console.table(result.rows);
      }
    }
    console.log(
      blockers === 0
        ? `ALL CHECKS PASS (${statements.length} checks) — safe to migrate`
        : `${blockers} BLOCKERS — do not migrate`,
    );
    process.exitCode = blockers === 0 ? 0 : 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
