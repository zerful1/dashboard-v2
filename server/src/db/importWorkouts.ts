import { Workbook } from "exceljs";
import type { PoolClient } from "pg";
import { DEFAULT_SPLIT, type SplitConfig } from "@dashboard/shared";
import { pool } from "./pool";
import { parseWorkoutSheet, type RowFixes, type SheetTab, type SheetWorkout } from "./workoutSheetParse";
import { toCell } from "./xlsxCell";

/**
 * One-off: the workouts the user logged in Google Sheets from June 2026, while
 * the gym tab went unused, into the dashboard.
 *
 *   npm run import-workouts -- "<Workout Split.xlsx>" --email <address> --schema <name> [--apply]
 *
 * Additive only. A session the dashboard already has gets the sets and cardio
 * it is missing; nothing is ever updated or deleted. A set the two disagree on
 * stops the whole import before anything is written. So it can be re-run on a
 * newer export of the sheet, and only what is new goes in.
 */

/**
 * The sheet's names for exercises the dashboard already knows under another
 * name. Each is backed by the same weights logged under both, so the history
 * and its stats read as one exercise:
 *
 * - T Bar Row, New Machine Preacher Curl: 2026-07-24 is logged in both, set for set.
 * - Overhead Extension: 14.7 kg x 15 in both (dashboard 06-08, sheet 06-23).
 * - Incline Dumbbell Press: 20 kg in both, in June.
 * - Machine Adduction: the split template's name. Standing Calf Raises: the history's.
 * - Incline Bench: 40 and 45 kg in both (dashboard 2025-11-28, sheet 2026-08-04).
 */
export const SHEET_RENAMES: Record<string, string> = {
  "Machine T Bar Row": "T Bar Row",
  "Machine Preacher Curl": "New Machine Preacher Curl",
  "Overhead Tricep Extension": "Overhead Extension",
  "Incline DB Press": "Incline Dumbbell Press",
  "Machine Adductor": "Machine Adduction",
  "Standing Calf Raise": "Standing Calf Raises",
  "Incline Bench Press": "Incline Bench",
};

/**
 * Single rows corrected by hand (2026-10-03). 24 Aug row 12 reads "Unilateral
 * Machine Row" at 63 kg, beside the real unilateral sets at 36.3 kg: "the 63kg
 * set isn't supposed to be unilateral". Machine Row is the history's name for
 * the two-arm machine.
 */
export const SHEET_ROW_FIXES: RowFixes = {
  "2026-08-24": { 12: "Machine Row" },
};

export interface ImportArgs {
  file: string;
  email: string;
  schema: string;
  apply: boolean;
}

const SAFE_SCHEMA = /^[a-z_][a-z0-9_]*$/;

/**
 * Refuses by shape before touching anything, like importCofid and seedDev. The
 * schema is named on the command line, never read from DB_SCHEMA where a stale
 * .env could supply it; app_test belongs to the tests, and nothing of ours
 * belongs in public (v1's, until 2026-10-20). Without --apply nothing is written.
 */
export function parseArgs(argv: string[]): ImportArgs {
  const usage = 'Usage: npm run import-workouts -- "<file.xlsx>" --email <address> --schema <name> [--apply]';
  const file = argv[0] && !argv[0].startsWith("--") ? argv[0] : undefined;
  if (!file) throw new Error(usage);
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    const v = i === -1 ? undefined : argv[i + 1];
    return v && !v.startsWith("--") ? v : undefined;
  };
  const schema = value("--schema");
  if (!schema) throw new Error(`--schema is required; it is never read from DB_SCHEMA. ${usage}`);
  if (!SAFE_SCHEMA.test(schema)) throw new Error(`Refusing unsafe schema name: ${schema}`);
  if (schema === "app_test" || schema === "public") throw new Error(`Refusing to import workouts into ${schema}`);
  const email = value("--email");
  if (!email) throw new Error(`--email is required: the account the workouts belong to. ${usage}`);
  return { file, email, schema, apply: argv.includes("--apply") };
}

export interface ImportReport {
  newSessions: number;
  /** Already in the dashboard, and given what they were missing. */
  filledSessions: number;
  /** Already in the dashboard with everything the sheet has. */
  unchangedSessions: number;
  setsAdded: number;
  setsAlreadyThere: number;
  cardioAdded: number;
  cardioAlreadyThere: number;
}

/** The two sources disagree. Nothing has been written. */
export class ImportConflict extends Error {
  constructor(readonly conflicts: string[]) {
    super(`The sheet disagrees with the dashboard - nothing written:\n  ${conflicts.join("\n  ")}`);
  }
}

type Cardio = SheetWorkout["cardio"][number];
const CARDIO_FIELDS = ["distance_miles", "duration_minutes", "speed", "incline", "calories_burned"] as const;
const sameCardio = (a: Cardio, b: Cardio) =>
  a.exercise === b.exercise && CARDIO_FIELDS.every((f) => (a[f] === null ? b[f] === null : b[f] !== null && Math.abs(a[f] - b[f]!) < 1e-9));
const setText = (kg: number, reps: number, bw: boolean, left: number | null, right: number | null) =>
  `${bw ? "bodyweight" : `${kg} kg`} x ${left !== null && right !== null ? `L${left} R${right}` : reps}`;

interface Planned {
  workout: SheetWorkout;
  dayType: number;
  dayName: string;
  sessionId: string | null;
  sets: SheetWorkout["sets"];
  cardio: Cardio[];
}

async function plan(client: PoolClient, S: string, userId: string, workouts: SheetWorkout[]) {
  const split =
    (await client.query<{ config: SplitConfig }>(`SELECT config FROM ${S}.workout_split WHERE user_id = $1`, [userId]))
      .rows[0]?.config ?? DEFAULT_SPLIT;
  const unknown = [...new Set(workouts.map((w) => w.day_name))].filter(
    (n) => !split.days.some((d) => d.label.toLowerCase() === n.toLowerCase()),
  );
  if (unknown.length) {
    throw new Error(
      `The split has no day called ${unknown.map((n) => `"${n}"`).join(", ")}. Its days are ${split.days.map((d) => d.label).join(", ")}.`,
    );
  }

  const report: ImportReport = {
    newSessions: 0, filledSessions: 0, unchangedSessions: 0,
    setsAdded: 0, setsAlreadyThere: 0, cardioAdded: 0, cardioAlreadyThere: 0,
  };
  const conflicts: string[] = [];
  const planned: Planned[] = [];

  for (const workout of workouts) {
    const day = split.days.find((d) => d.label.toLowerCase() === workout.day_name.toLowerCase())!;
    const existing = (
      await client.query<{ id: string; day_name: string }>(
        `SELECT id, day_name FROM ${S}.workout_sessions WHERE user_id = $1 AND date = $2 AND day_type = $3`,
        [userId, workout.date, day.day_type],
      )
    ).rows[0];

    if (!existing) {
      report.newSessions++;
      report.setsAdded += workout.sets.length;
      report.cardioAdded += workout.cardio.length;
      planned.push({ workout, dayType: day.day_type, dayName: day.label, sessionId: null, sets: workout.sets, cardio: workout.cardio });
      continue;
    }

    if (existing.day_name !== day.label) {
      conflicts.push(`${workout.date}: the dashboard's session is "${existing.day_name}", the sheet's is "${day.label}"`);
      continue;
    }
    const haveSets = (
      await client.query<{
        exercise_name: string; set_number: number; kg: number; reps: number;
        reps_left: number | null; reps_right: number | null; is_bodyweight: boolean;
      }>(
        `SELECT exercise_name, set_number, weight_kg::float8 AS kg, reps, reps_left, reps_right, is_bodyweight
           FROM ${S}.workout_sets WHERE user_id = $1 AND session_id = $2`,
        [userId, existing.id],
      )
    ).rows;
    const haveCardio = (
      await client.query<Cardio>(
        `SELECT exercise, distance_miles::float8 AS distance_miles, duration_minutes, speed::float8 AS speed,
                incline::float8 AS incline, calories_burned
           FROM ${S}.cardio_entries WHERE user_id = $1 AND session_id = $2`,
        [userId, existing.id],
      )
    ).rows;

    const sets = workout.sets.filter((s) => {
      const have = haveSets.find((h) => h.exercise_name === s.exercise_name && h.set_number === s.set_number);
      if (!have) return true;
      const same =
        have.is_bodyweight === s.is_bodyweight &&
        have.reps === s.reps &&
        have.reps_left === s.reps_left &&
        have.reps_right === s.reps_right &&
        (s.is_bodyweight || Math.abs(have.kg - s.weight_kg) < 1e-9);
      if (same) report.setsAlreadyThere++;
      else {
        conflicts.push(
          `${workout.date} ${s.exercise_name} set ${s.set_number}: the dashboard has ` +
            `${setText(have.kg, have.reps, have.is_bodyweight, have.reps_left, have.reps_right)}, ` +
            `the sheet has ${setText(s.weight_kg, s.reps, s.is_bodyweight, s.reps_left, s.reps_right)}`,
        );
      }
      return false;
    });
    const cardio = workout.cardio.filter((c) => {
      if (haveCardio.some((h) => sameCardio(h, c))) {
        report.cardioAlreadyThere++;
        return false;
      }
      if (haveCardio.some((h) => h.exercise === c.exercise)) {
        conflicts.push(`${workout.date} ${c.exercise}: the dashboard's cardio differs from the sheet's`);
        return false;
      }
      return true;
    });

    report.setsAdded += sets.length;
    report.cardioAdded += cardio.length;
    if (sets.length || cardio.length) report.filledSessions++;
    else report.unchangedSessions++;
    planned.push({ workout, dayType: day.day_type, dayName: day.label, sessionId: existing.id, sets, cardio });
  }

  if (conflicts.length) throw new ImportConflict(conflicts);
  return { report, planned };
}

async function write(client: PoolClient, S: string, userId: string, planned: Planned[]): Promise<void> {
  for (const p of planned) {
    if (p.sessionId === null && !p.sets.length && !p.cardio.length) continue;
    const sessionId =
      p.sessionId ??
      (
        await client.query<{ id: string }>(
          `INSERT INTO ${S}.workout_sessions (user_id, date, day_type, day_name) VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, p.workout.date, p.dayType, p.dayName],
        )
      ).rows[0]!.id;
    for (const s of p.sets) {
      await client.query(
        `INSERT INTO ${S}.workout_sets
           (user_id, session_id, exercise_name, set_number, weight_kg, reps, reps_left, reps_right, is_bodyweight)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        // Bodyweight sets are stored at 0, as upsertSet does.
        [userId, sessionId, s.exercise_name, s.set_number, s.is_bodyweight ? 0 : s.weight_kg, s.reps,
         s.reps_left, s.reps_right, s.is_bodyweight],
      );
    }
    for (const c of p.cardio) {
      await client.query(
        `INSERT INTO ${S}.cardio_entries
           (user_id, session_id, exercise, distance_miles, duration_minutes, speed, incline, calories_burned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, sessionId, c.exercise, c.distance_miles, c.duration_minutes, c.speed, c.incline, c.calories_burned],
      );
    }
  }
}

/**
 * Plans, then writes only with `apply`. One transaction either way, and a dry
 * run's is READ ONLY, so Postgres itself refuses any write it might attempt.
 */
export async function runImport(
  schema: string,
  userId: string,
  workouts: SheetWorkout[],
  { apply }: { apply: boolean },
): Promise<ImportReport> {
  if (!SAFE_SCHEMA.test(schema)) throw new Error(`Refusing unsafe schema name: ${schema}`);
  const client = await pool.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    const { report, planned } = await plan(client, schema, userId, workouts);
    if (apply) await write(client, schema, userId, planned);
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return report;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function readTabs(file: string): Promise<SheetTab[]> {
  const wb = new Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((ws) => ({ name: ws.name, cell: (address: string) => toCell(ws.getCell(address).value) }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { workouts, notes, ignoredTabs } = parseWorkoutSheet(await readTabs(args.file), SHEET_RENAMES, SHEET_ROW_FIXES);

  console.log(args.file);
  console.log(`  ${workouts.length} sessions, ${workouts.reduce((n, w) => n + w.sets.length, 0)} sets ` +
    `(${workouts[0]?.date ?? "-"} to ${workouts.at(-1)?.date ?? "-"}); ignored tabs: ${ignoredTabs.join(", ") || "none"}`);
  for (const note of notes) console.log(`  note: ${note}`);

  const user = (
    await pool.query<{ id: string }>(`SELECT id FROM ${args.schema}.users WHERE lower(email) = lower($1)`, [args.email])
  ).rows[0];
  if (!user) throw new Error(`No account ${args.email} in ${args.schema}`);

  const r = await runImport(args.schema, user.id, workouts, { apply: args.apply });
  console.log(`  ${args.schema}, ${args.email}:`);
  console.log(`    sessions: ${r.newSessions} new, ${r.filledSessions} filled in, ${r.unchangedSessions} already complete`);
  console.log(`    sets: ${r.setsAdded} to add, ${r.setsAlreadyThere} already there`);
  console.log(`    cardio: ${r.cardioAdded} to add, ${r.cardioAlreadyThere} already there`);
  console.log(args.apply ? "Written." : "Dry run - nothing written. Re-run with --apply to write.");
  await pool.end();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}
