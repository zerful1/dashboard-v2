import { calculateStreak, shiftISO, MAX_HABITS, type Habit, type HabitSummary } from "@dashboard/shared";
import { pool, withTransaction } from "../db/pool";
import { T } from "../config";

// created_at as an ISO string, as the type says (see nutritionTargets.ts).
const COLS = `id, user_id, name, emoji, sort_order,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at`;

/** Each habit with its streak and its days in the strip, both counted from the caller's `today`. */
export async function listHabits(userId: string, today: string): Promise<HabitSummary[]> {
  const habits = await pool.query<Habit>(
    `SELECT ${COLS} FROM ${T.habits} WHERE user_id = $1 ORDER BY sort_order, created_at`,
    [userId],
  );
  // Every date up to today, not just the strip: a streak can run back months.
  const days = await pool.query<{ habit_id: string; date: string }>(
    `SELECT habit_id, completed_date::text AS date FROM ${T.habitCompletions}
      WHERE user_id = $1 AND completed_date <= $2::date`,
    [userId, today],
  );
  const from = shiftISO(today, -6);
  return habits.rows.map((h) => {
    const dates = days.rows.filter((d) => d.habit_id === h.id).map((d) => d.date);
    return { ...h, streak: calculateStreak(dates, today), recent: dates.filter((d) => d >= from).sort() };
  });
}

export async function addHabit(userId: string, name: string, emoji: string | null): Promise<Habit | "full"> {
  const count = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${T.habits} WHERE user_id = $1`,
    [userId],
  );
  if (count.rows[0]!.n >= MAX_HABITS) return "full";
  const { rows } = await pool.query<Habit>(
    `INSERT INTO ${T.habits} (user_id, name, emoji, sort_order)
     VALUES ($1, $2, $3, (SELECT coalesce(max(sort_order), 0) + 1 FROM ${T.habits} WHERE user_id = $1))
     RETURNING ${COLS}`,
    [userId, name, emoji],
  );
  return rows[0]!;
}

/** `emoji: null` clears it; an absent field is left as it is. Null for another user's habit. */
export async function updateHabit(
  userId: string,
  id: string,
  patch: { name?: string; emoji?: string | null },
): Promise<Habit | null> {
  const { rows } = await pool.query<Habit>(
    `UPDATE ${T.habits}
        SET name = coalesce($3, name),
            emoji = CASE WHEN $4::boolean THEN $5 ELSE emoji END
      WHERE id = $2 AND user_id = $1
      RETURNING ${COLS}`,
    [userId, id, patch.name ?? null, patch.emoji !== undefined, patch.emoji ?? null],
  );
  return rows[0] ?? null;
}

export async function deleteHabit(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM ${T.habits} WHERE id = $2 AND user_id = $1`, [userId, id]);
  return (rowCount ?? 0) > 0;
}

/** False unless `ids` is exactly the user's habits, each once. */
export async function reorderHabits(userId: string, ids: string[]): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM ${T.habits} WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const mine = new Set(rows.map((r) => r.id));
    if (ids.length !== mine.size || new Set(ids).size !== ids.length || !ids.every((id) => mine.has(id))) {
      return false;
    }
    await client.query(
      `UPDATE ${T.habits} h SET sort_order = o.n
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, n)
        WHERE h.id = o.id AND h.user_id = $1`,
      [userId, ids],
    );
    return true;
  });
}

/**
 * Mark or clear one day. False only when the habit isn't the caller's: the
 * count comes from the ownership lookup, not from the write, so a day already
 * in the state asked for is still true (a double tap or a retry is harmless).
 */
export async function setDone(userId: string, habitId: string, date: string, done: boolean): Promise<boolean> {
  const write = done
    ? `INSERT INTO ${T.habitCompletions} (user_id, habit_id, completed_date)
       SELECT $1::uuid, id, $3::date FROM h
       ON CONFLICT (habit_id, completed_date) DO NOTHING`
    : `DELETE FROM ${T.habitCompletions} WHERE habit_id IN (SELECT id FROM h) AND completed_date = $3::date`;
  const { rows } = await pool.query<{ n: number }>(
    `WITH h AS (SELECT id FROM ${T.habits} WHERE id = $2 AND user_id = $1),
          w AS (${write})
     SELECT count(*)::int AS n FROM h`,
    [userId, habitId, date],
  );
  return rows[0]!.n > 0;
}
