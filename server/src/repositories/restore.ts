import type { PoolClient } from "pg";
import { RESTORED_TABLES, type RestoreCounts, type RestoredTable } from "@dashboard/shared";
import { withTransaction } from "../db/pool";
import { T } from "../config";

type Row = Record<string, unknown>;

/** Settings and the template, where the current ones win (redesign part 8, §6.3). */
export const NOT_RESTORED = ["profiles", "workout_split", "exercises"] as const;

const REF: Record<RestoredTable, string> = {
  body_weight: T.bodyWeight,
  nutrition_targets: T.nutritionTargets,
  food_items: T.foodItems,
  food_log_entries: T.foodLogEntries,
  workout_sessions: T.workoutSessions,
  workout_sets: T.workoutSets,
  cardio_entries: T.cardioEntries,
  goals: T.goals,
  habits: T.habits,
  habit_completions: T.habitCompletions,
};

/**
 * How a parent the account already holds under another id is recognised: the
 * same clash its unique constraint would refuse. Habits have none, so only
 * their id matches.
 */
const NATURAL_KEY = {
  workout_sessions: "m.date = f.date AND m.day_type = f.day_type",
  food_items: "f.external_id IS NOT NULL AND m.external_source = f.external_source AND m.external_id = f.external_id",
  habits: "false",
};
type Parent = keyof typeof NATURAL_KEY;

/**
 * A child's parent column, and what becomes of a child whose parent isn't the
 * user's: a set or a tick is dropped, while a food entry keeps its numbers and
 * loses its food, as deleting a food does.
 */
const CHILD: Partial<Record<RestoredTable, { column: string; parent: Parent; orphan: "drop" | "null" }>> = {
  food_log_entries: { column: "food_item_id", parent: "food_items", orphan: "null" },
  workout_sets: { column: "session_id", parent: "workout_sessions", orphan: "drop" },
  cardio_entries: { column: "session_id", parent: "workout_sessions", orphan: "drop" },
  habit_completions: { column: "habit_id", parent: "habits", orphan: "drop" },
};

/**
 * Moves the habits the account lacks after the ones it has, keeping the file's
 * order among them. Their old sort_order would otherwise tie with, or slot
 * between, habits added since; renumbering those instead would change the
 * account, which a restore never does. Habits that already come after keep
 * their numbers, so an account with none gets back exactly what it had.
 */
async function afterCurrentHabits(client: PoolClient, userId: string, rows: Row[]): Promise<Row[]> {
  const { rows: mine } = await client.query<{ id: string; sort_order: number }>(
    `SELECT id, sort_order FROM ${T.habits} WHERE user_id = $1`,
    [userId],
  );
  const have = new Set(mine.map((h) => h.id));
  const top = Math.max(...mine.map((h) => h.sort_order));
  const low = Math.min(...rows.filter((r) => !have.has(String(r.id))).map((r) => Number(r.sort_order)));
  // Not a clash (or nothing to compare, or a value Postgres will refuse anyway).
  if (!(low <= top)) return rows;
  return rows.map((r) => ({ ...r, sort_order: Number(r.sort_order) + top - low + 1 }));
}

/** Thrown at the end of a preview so its transaction rolls back, carrying what it counted. */
class DryRun extends Error {
  constructor(readonly counts: RestoreCounts) {
    super("dry run");
  }
}

/**
 * Maps each parent id the children name to the user's own row: the same id, or
 * else the row the file's parent clashes with on its natural key. An id with no
 * such row (someone else's, or nobody's) is absent from the map. A reference
 * the file holds no parent for goes in as a bare `{ id }`, which can only match
 * by id.
 */
async function parentMap(
  client: PoolClient,
  userId: string,
  parent: Parent,
  fileParents: Row[],
  refs: string[],
): Promise<Map<string, string>> {
  if (refs.length === 0) return new Map();
  const byId = new Map(fileParents.map((p) => [String(p.id), p]));
  const rows = refs.map((id) => byId.get(id) ?? { id });
  const ref = REF[parent];
  const { rows: found } = await client.query<{ file_id: string; mine: string }>(
    `SELECT DISTINCT ON (f.id) f.id AS file_id, m.id AS mine
       FROM jsonb_populate_recordset(NULL::${ref}, $2::jsonb) f
       JOIN ${ref} m ON m.user_id = $1 AND (m.id = f.id OR (${NATURAL_KEY[parent]}))
      ORDER BY f.id, (m.id = f.id) DESC`,
    [userId, JSON.stringify(rows)],
  );
  return new Map(found.map((r) => [r.file_id, r.mine]));
}

/**
 * Adds back the rows of a download that the account is missing, and changes
 * nothing it already has (redesign part 8, §6.4). One transaction, in
 * RESTORED_TABLES order; each insert skips any row that clashes on its id or
 * its natural key (a bare ON CONFLICT DO NOTHING: no target, so both kinds).
 *
 * Every row becomes the user's, whatever its user_id said, and a child is
 * re-pointed to the user's copy of its parent before it goes in, so a session
 * the account already holds under another id receives only the sets it lacks.
 * A child whose parent isn't the user's never attaches to anyone else's row.
 *
 * Postgres checks every value against its column and constraints; any failure
 * rolls the whole restore back. `dryRun` runs all of it and rolls back too, so
 * a preview's counts are the restore's.
 */
export async function restoreUserData(
  userId: string,
  tables: Record<string, Row[]>,
  opts: { dryRun: boolean },
): Promise<RestoreCounts> {
  try {
    return await withTransaction(async (client) => {
      const counts = {} as RestoreCounts;
      for (const table of RESTORED_TABLES) {
        let rows: Row[] = (tables[table] ?? []).map((r) => ({ ...r, user_id: userId }));
        if (table === "habits") rows = await afterCurrentHabits(client, userId, rows);
        const child = CHILD[table];
        if (child) {
          const refs = [...new Set(rows.map((r) => r[child.column]).filter((v): v is string => typeof v === "string"))];
          const map = await parentMap(client, userId, child.parent, tables[child.parent] ?? [], refs);
          rows = rows.flatMap((r) => {
            const to = map.get(r[child.column] as string);
            if (to) return [{ ...r, [child.column]: to }];
            return child.orphan === "drop" ? [] : [{ ...r, [child.column]: null }];
          });
        }
        if (rows.length === 0) {
          counts[table] = 0;
          continue;
        }
        const res = await client.query(
          `INSERT INTO ${REF[table]}
           SELECT * FROM jsonb_populate_recordset(NULL::${REF[table]}, $1::jsonb)
           ON CONFLICT DO NOTHING
           RETURNING 1`,
          [JSON.stringify(rows)],
        );
        counts[table] = res.rowCount ?? 0;
      }
      if (opts.dryRun) throw new DryRun(counts);
      return counts;
    });
  } catch (err) {
    if (err instanceof DryRun) return err.counts;
    throw err;
  }
}
