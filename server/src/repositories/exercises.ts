import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import type { Exercise, ExerciseNameRow } from "@dashboard/shared";

export async function listExercises(userId: string, dayType: number): Promise<Exercise[]> {
  const { rows } = await pool.query<Exercise>(
    `SELECT id, user_id, day_type, exercise_name, sort_order
       FROM ${T.exercises}
      WHERE user_id = $1 AND day_type = $2
      ORDER BY sort_order`,
    [userId, dayType],
  );
  return rows;
}

/** Every template row across all days — feeds evaluateRename. */
export async function listAllExerciseNames(userId: string): Promise<ExerciseNameRow[]> {
  const { rows } = await pool.query<ExerciseNameRow>(
    `SELECT exercise_name, day_type FROM ${T.exercises} WHERE user_id = $1`,
    [userId],
  );
  return rows;
}

/**
 * Appends at the end of the day's list.
 *
 * sort_order is computed from the live table inside the statement rather than
 * from a value the caller passed, so two concurrent adds cannot collide on a
 * stale maximum.
 */
export async function addExercise(
  userId: string,
  dayType: number,
  name: string,
): Promise<Exercise> {
  const { rows } = await pool.query<Exercise>(
    `INSERT INTO ${T.exercises} (user_id, day_type, exercise_name, sort_order)
     SELECT $1, $2, $3, COALESCE(MAX(sort_order), 0) + 1
       FROM ${T.exercises} WHERE user_id = $1 AND day_type = $2
     RETURNING id, user_id, day_type, exercise_name, sort_order`,
    [userId, dayType, name.trim()],
  );
  return rows[0]!;
}

/**
 * Removes a template row only. Historical workout_sets are untouched, because
 * exercise_name is denormalised with no foreign key — deleting an exercise you
 * have stopped doing must never delete the record that you did it.
 */
export async function deleteExercise(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM ${T.exercises} WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Rewrites the whole day's ordering from an explicit list of ids.
 *
 * v1 swapped pairs, which needed two round trips per nudge and could
 * interleave. Taking the final order means one transaction and an outcome that
 * does not depend on how many moves produced it.
 *
 * Each UPDATE is scoped by user_id and day_type, so an id belonging to another
 * user — or to another day — matches nothing and silently changes nothing.
 */
export async function reorderExercises(
  userId: string,
  dayType: number,
  orderedIds: string[],
): Promise<Exercise[]> {
  return withTransaction(async (client) => {
    for (const [index, id] of orderedIds.entries()) {
      await client.query(
        `UPDATE ${T.exercises} SET sort_order = $3
          WHERE user_id = $1 AND id = $2 AND day_type = $4`,
        [userId, id, index + 1, dayType],
      );
    }
    const { rows } = await client.query<Exercise>(
      `SELECT id, user_id, day_type, exercise_name, sort_order
         FROM ${T.exercises} WHERE user_id = $1 AND day_type = $2 ORDER BY sort_order`,
      [userId, dayType],
    );
    return rows;
  });
}

export interface RenameResult {
  exercisesUpdated: number;
  setsUpdated: number;
  /** The casing actually written — may differ from the request when merging. */
  finalName: string;
}

/**
 * Rename an exercise everywhere it appears.
 *
 * Matches by NAME, not id. The same exercise can exist on several days, and all
 * of them plus every historical set must move together — renaming by id would
 * move one template row and strand the rest, plus ten months of sets, under the
 * old name.
 *
 * Both updates run in ONE transaction. v1 ran them sequentially, so a failure
 * between them left history under a name the template no longer contained:
 * workout_sets.exercise_name is denormalised with no foreign key, so nothing in
 * the database would have flagged the inconsistency.
 */
export async function renameExercise(
  userId: string,
  oldName: string,
  newName: string,
): Promise<RenameResult> {
  const trimmed = newName.trim();
  return withTransaction(async (client) => {
    const ex = await client.query(
      `UPDATE ${T.exercises} SET exercise_name = $3
        WHERE user_id = $1 AND exercise_name = $2`,
      [userId, oldName, trimmed],
    );
    const sets = await client.query(
      `UPDATE ${T.workoutSets} SET exercise_name = $3
        WHERE user_id = $1 AND exercise_name = $2`,
      [userId, oldName, trimmed],
    );
    return {
      exercisesUpdated: ex.rowCount ?? 0,
      setsUpdated: sets.rowCount ?? 0,
      finalName: trimmed,
    };
  });
}
