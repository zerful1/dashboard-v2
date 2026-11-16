import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import type { Exercise, ExerciseNameRow } from "@dashboard/shared";
import { Conflict } from "../errors";

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

/** Appends at the end; sort_order is computed in the statement so concurrent adds cannot collide. */
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

/** Removes a template row only: workout_sets has no foreign key and must outlive it. */
export async function deleteExercise(userId: string, id: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM ${T.exercises} WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Rewrites the day's order from explicit ids; each UPDATE is scoped by user_id and day_type, so foreign ids match nothing. */
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

/** Renames by NAME across template and history in one transaction; throws Conflict if a workout holds a set number under both names. */
export async function renameExercise(
  userId: string,
  oldName: string,
  newName: string,
): Promise<RenameResult> {
  const trimmed = newName.trim();
  return withTransaction(async (client) => {
    const clash = await client.query(
      `SELECT 1 FROM ${T.workoutSets} a
         JOIN ${T.workoutSets} b
           ON b.session_id = a.session_id AND b.set_number = a.set_number
        WHERE a.user_id = $1 AND b.user_id = $1
          AND a.exercise_name = $2 AND b.exercise_name = $3 AND $2 <> $3
        LIMIT 1`,
      [userId, oldName, trimmed],
    );
    if ((clash.rowCount ?? 0) > 0) {
      throw new Conflict("You've logged both in the same workout, so one can't take the other's name");
    }
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
    // Lift goals match by name too; merging keeps the target's goal, since one goal per lift is unique.
    await client.query(
      `DELETE FROM ${T.goals}
        WHERE user_id = $1 AND kind = 'lift' AND exercise_name = $2 AND $2 <> $3
          AND EXISTS (SELECT 1 FROM ${T.goals}
                       WHERE user_id = $1 AND kind = 'lift' AND exercise_name = $3)`,
      [userId, oldName, trimmed],
    );
    await client.query(
      `UPDATE ${T.goals} SET exercise_name = $3
        WHERE user_id = $1 AND kind = 'lift' AND exercise_name = $2`,
      [userId, oldName, trimmed],
    );
    return {
      exercisesUpdated: ex.rowCount ?? 0,
      setsUpdated: sets.rowCount ?? 0,
      finalName: trimmed,
    };
  });
}
