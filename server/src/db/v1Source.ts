import type { PoolClient } from "pg";

/**
 * How the v1 data in `public` is identified. One definition, three consumers:
 * driftReport, deltaV1 and verifyV1.
 *
 * Both constants below encode a *decision*, not a detail, which is why they live
 * here rather than being retyped at each call site. Three copies that agree
 * today are three copies that can disagree later, and a drift report disagreeing
 * with the delta it gates would be worse than either being wrong alone.
 *
 * NOTE: `importV1.ts` deliberately keeps its own copies and does NOT import from
 * here. It is the script that actually produced the migrated data on 2026-08-15;
 * editing it now would mean the file no longer matches what ran. It is a
 * historical record and will not be executed again.
 */

/**
 * The real v1 account: the one owning the most workout_sets.
 *
 * `public` holds three user_ids. One has 991 sets — the account being migrated.
 * The other two are abandoned: one holds only a seeded exercise template, the
 * other that plus 3 sessions and 2 sets, including the `Lat Pulldown 777 kg x 77`
 * row that JUNK_SET_RULE describes. Deriving the account from the data rather
 * than an env var removes a step that can be forgotten, and forgetting it is
 * not a silent failure mode worth keeping.
 */
export const V1_USER_SQL = `(SELECT user_id FROM public.workout_sets GROUP BY 1 ORDER BY count(*) DESC LIMIT 1)`;

/**
 * The same account as a value, for queries that pass it as a bound parameter
 * rather than inlining the subquery.
 */
export async function resolveV1UserId(c: PoolClient): Promise<string> {
  const { rows } = await c.query<{ user_id: string }>(
    `SELECT user_id FROM public.workout_sets GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
  );
  const id = rows[0]?.user_id;
  if (!id) throw new Error("No rows in public.workout_sets — cannot identify the v1 account");
  return id;
}

/**
 * A prospective guard against a mis-entry, not a filter that removes anything.
 *
 * It excluded exactly zero rows from the migrating account in Phase 3, and
 * verifyV1 asserts that it still does — a filter that silently shrinks a
 * migration is invisible in a row count, so its inertness has to be a checked
 * fact rather than a claim in a comment.
 *
 * The rule matters MORE to the delta than it did to the original import. Its
 * stated justification was "v1 is still deployed and still being logged to, so a
 * mis-entry could land in the real account between now and the run" — and the
 * delta is precisely that window.
 */
export const JUNK_SET_RULE = "NOT (weight_kg > 300 OR reps > 50)";
