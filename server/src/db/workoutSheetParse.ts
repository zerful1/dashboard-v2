/**
 * Reads the user's Google Sheets workout tracker: one tab per session, named
 * DDMMYYYY, each a copy of the "Tracker Template" tab.
 *
 *   C4  date, as free text ("19th June 2026")   C6  muscle group = the day's name
 *   rows 10-20  B exercise, then up to five sets as weight/reps column pairs
 *   rows 22-23  B cardio exercise, C miles, E minutes, G speed, I incline, K kcal
 *
 * Pure: the importer hands it cells, so every rule here is tested without a
 * workbook or a database. Nothing is guessed - a value it cannot read is left
 * out and said so in `notes`, which the importer prints before writing.
 */

export type Cell = string | number | null;

export interface SheetTab {
  name: string;
  cell(address: string): Cell;
}

export interface SheetSet {
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_bodyweight: boolean;
}

export interface SheetCardio {
  exercise: string;
  distance_miles: number | null;
  duration_minutes: number | null;
  speed: number | null;
  incline: number | null;
  calories_burned: number | null;
}

export interface SheetWorkout {
  date: string;
  day_name: string;
  sets: SheetSet[];
  cardio: SheetCardio[];
}

export interface SheetParseResult {
  workouts: SheetWorkout[];
  /** Everything left out or adjusted, one line each, for the user to read. */
  notes: string[];
  ignoredTabs: string[];
}

const EXERCISE_ROWS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const SET_COLUMNS = [["C", "D"], ["E", "F"], ["G", "H"], ["I", "J"], ["K", "L"]] as const;
const CARDIO_ROWS = [22, 23];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** DDMMYYYY to YYYY-MM-DD, or null when the name is not that shape. Throws on an impossible day. */
function tabDate(name: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(name.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new Error(`Tab "${name}" looks like a date but is not a real day`);
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "19th June 2026" to 2026-06-19, or null when it does not read as a date. */
function textDate(text: string): string | null {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  return month === -1 ? null : `${m[3]}-${pad(month + 1)}-${pad(Number(m[1]))}`;
}

function number(v: Cell): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = v.trim();
  return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
}

const isEmpty = (v: Cell) => v === null || (typeof v === "string" && v.trim() === "");
const shown = (v: Cell) => (typeof v === "string" ? v.trim() : String(v));
const name = (v: Cell) => (isEmpty(v) ? null : shown(v).replace(/\s+/g, " "));

/** Whole reps, or "a | b" (left | right on a unilateral lift) read as the lower. */
function readReps(v: Cell): { reps: number; split: boolean } | null {
  const n = number(v);
  if (n !== null) return Number.isInteger(n) && n > 0 ? { reps: n, split: false } : null;
  const pair = typeof v === "string" ? /^\s*(\d+)\s*\|\s*(\d+)\s*$/.exec(v) : null;
  if (!pair) return null;
  const reps = Math.min(Number(pair[1]), Number(pair[2]));
  return reps > 0 ? { reps, split: true } : null;
}

function parseTab(tab: SheetTab, date: string, renames: Record<string, string>, notes: string[]): SheetWorkout {
  const dayName = name(tab.cell("C6"));
  if (!dayName) throw new Error(`Tab "${tab.name}" has no day name in C6 (Muscle Group)`);

  const dateCell = tab.cell("C4");
  if (!isEmpty(dateCell) && textDate(shown(dateCell)) !== date) {
    notes.push(`${date}: the date cell says "${shown(dateCell)}"; used the tab name`);
  }

  const sets: SheetSet[] = [];
  const rowsPerExercise = new Map<string, number>();
  for (const row of EXERCISE_ROWS) {
    const raw = name(tab.cell(`B${row}`));
    const pairs = SET_COLUMNS.map(([w, r]) => [tab.cell(`${w}${row}`), tab.cell(`${r}${row}`)] as const);
    if (!raw) {
      if (pairs.some(([w, r]) => !isEmpty(w) || !isEmpty(r))) {
        notes.push(`${date} row ${row}: sets with no exercise name; left out`);
      }
      continue;
    }
    const exercise = renames[raw] ?? raw;
    rowsPerExercise.set(exercise, (rowsPerExercise.get(exercise) ?? 0) + 1);
    const before = sets.length;
    pairs.forEach(([w, r], i) => {
      const label = `${date} ${raw}: set ${i + 1}`;
      if (isEmpty(w) && isEmpty(r)) return;
      if (isEmpty(r)) return void notes.push(`${label} has a weight (${shown(w)}) but no reps; left out`);
      if (isEmpty(w)) return void notes.push(`${label} has reps (${shown(r)}) but no weight; left out`);
      const weight = number(w);
      if (weight === null || weight < 0) return void notes.push(`${label} weight "${shown(w)}" is not a weight; left out`);
      const reps = readReps(r);
      if (!reps) return void notes.push(`${label} reps "${shown(r)}" are not a whole number; left out`);
      if (reps.split) notes.push(`${label} reps "${shown(r)}"; logged ${reps.reps}`);
      const numbered = sets.filter((s) => s.exercise_name === exercise).length + 1;
      sets.push({
        exercise_name: exercise,
        set_number: numbered,
        weight_kg: weight,
        reps: reps.reps,
        // The dashboard's own convention: a bodyweight set is flagged and stored at 0.
        is_bodyweight: weight === 0,
      });
    });
    if (sets.length === before) notes.push(`${date} ${raw}: no sets; left out`);
  }
  for (const [exercise, rows] of rowsPerExercise) {
    if (rows > 1) {
      const n = sets.filter((s) => s.exercise_name === exercise).length;
      notes.push(`${date} ${exercise}: on ${rows === 2 ? "two" : rows} rows; numbered as one exercise, sets 1-${n}`);
    }
  }

  const cardio: SheetCardio[] = [];
  for (const row of CARDIO_ROWS) {
    const exercise = name(tab.cell(`B${row}`));
    const values = ["C", "E", "G", "I", "K"].map((c) => number(tab.cell(`${c}${row}`)));
    if (!exercise) {
      if (values.some((v) => v !== null)) notes.push(`${date} cardio row ${row}: values with no exercise; left out`);
      continue;
    }
    const [miles, minutes, speed, incline, kcal] = values;
    cardio.push({
      exercise,
      distance_miles: miles ?? null,
      // Whole numbers in the database (smallint).
      duration_minutes: minutes == null ? null : Math.round(minutes),
      speed: speed ?? null,
      incline: incline ?? null,
      calories_burned: kcal == null ? null : Math.round(kcal),
    });
  }

  return { date, day_name: dayName, sets, cardio };
}

export function parseWorkoutSheet(tabs: SheetTab[], renames: Record<string, string> = {}): SheetParseResult {
  const workouts: SheetWorkout[] = [];
  const notes: string[] = [];
  const ignoredTabs: string[] = [];
  for (const tab of tabs) {
    const date = tabDate(tab.name);
    if (date === null) {
      ignoredTabs.push(tab.name);
      continue;
    }
    const workout = parseTab(tab, date, renames, notes);
    // An empty session would read in the history as a workout that was skipped.
    if (workout.sets.length === 0 && workout.cardio.length === 0) {
      notes.push(`${date}: nothing logged; left out`);
      continue;
    }
    workouts.push(workout);
  }
  return { workouts, notes, ignoredTabs };
}
