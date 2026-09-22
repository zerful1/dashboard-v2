import { randomUUID } from "node:crypto";
import { withTransaction, pool } from "./pool";
import { config, T } from "../config";
import { shiftISO } from "@dashboard/shared";

/**
 * Sample gym history for a development account.
 *
 * Exists because a fresh dev account renders every gym screen empty: the Stats
 * tab has nothing to pick, the progression chart has no points, and History has
 * no pages. Reviewing those screens needs data with the same SHAPE as the real
 * account, not merely some rows.
 *
 * What the generated history deliberately contains, and why:
 *
 *  - Two split eras. `day_type` is reused across them — historical 'Upper A' and
 *    current 'Push' are both day_type 1, exactly as the migrated v1 history is
 *    (see the workout_sessions DDL). Any screen that resolves day_type instead
 *    of reading the snapshotted day_name will visibly mix the two eras.
 *  - Exercises that exist only in history. The stats picker reads DISTINCT names
 *    from workout_sets rather than the template, so retired lifts stay
 *    reachable; against a template-shaped seed that difference is invisible.
 *  - One bodyweight-only lift, which drives the isBodyweightOnly branch of
 *    computeExerciseStats (top REPS rather than top weight, delta in reps).
 *  - A session reaching six sets on one exercise, and one with a hole punched in
 *    the middle of a row. The history table derives its column count and renders
 *    by set_number; both only show up against data shaped like this.
 *
 * NEVER writes to `public`, and refuses to run against any schema whose name
 * does not end in `_dev`. `DB_SCHEMA=app npx tsx …` is an established habit in
 * this repo for read-only checks, and this script is not read-only.
 *
 * Usage:
 *   npm run seed-dev -w @dashboard/server -- --email dev@local.test --reset
 */

/**
 * The guard, and the most important lines in the file.
 *
 * Mirrors tests/setup.ts, which refuses any schema but app_test before it
 * truncates: the aim is not to remind anyone that a writer must not be pointed
 * at production, but to make it impossible. A suffix rule rather than a list,
 * so a second local schema needs no edit here and `app` can never satisfy it.
 */
const SEEDABLE_SCHEMA = /_dev$/;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const ERA_1_START = "2026-02-02"; // Monday
const ERA_2_START = "2026-04-27"; // Monday
const HISTORY_END = "2026-08-23"; // yesterday, leaving today an empty slate to log into

/** Chance a scheduled session simply did not happen. Real history has holes. */
const MISSED_SESSION_RATE = 0.18;

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

interface Prescription {
  name: string;
  /** Working weight in kg at week 0 — or starting REPS when bodyweight. */
  start: number;
  /** Added per training week, before the deload and the day-to-day noise. */
  perWeek: number;
  /** Smallest jump this lift actually moves in: plates, or a machine's stack. */
  step: number;
  sets: number;
  /** Reps on the first set; later sets fall off from here. */
  topReps: number;
  bodyweight?: boolean;
}

const P = (
  name: string,
  start: number,
  perWeek: number,
  step: number,
  sets: number,
  topReps: number,
  bodyweight = false,
): Prescription => ({ name, start, perWeek, step, sets, topReps, bodyweight });

interface DayPlan {
  day_type: number;
  day_name: string;
  exercises: Prescription[];
}

/**
 * Era 1 — a three-day upper/lower rotation, retired at the end of April.
 *
 * 'Upper A' and 'Upper B' take day_type 1 and 2, which the current split later
 * reuses for Push and Pull. That collision is the point: it is what the real
 * migrated history looks like.
 */
const ERA_1: Record<number, DayPlan> = {
  0: {
    day_type: 1,
    day_name: "Upper A",
    exercises: [
      P("Bench Press", 60, 0.55, 2.5, 3, 8),
      P("Barbell Row", 55, 0.5, 2.5, 3, 9),
      P("Machine Shoulder Press", 35, 0.4, 2.5, 3, 10),
      P("Skullcrusher", 22.5, 0.25, 1.25, 3, 10),
    ],
  },
  2: {
    day_type: 2,
    day_name: "Upper B",
    exercises: [
      P("Incline Dumbbell Press", 22.5, 0.3, 1.25, 3, 9),
      P("Lat Pulldown", 45, 0.55, 2.5, 3, 9),
      P("Chest Fly", 15, 0.2, 1.25, 3, 12),
      P("Preacher Curl", 20, 0.2, 1.25, 3, 10),
    ],
  },
  4: {
    day_type: 3,
    day_name: "Legs",
    exercises: [
      P("Barbell Squat", 70, 0.7, 2.5, 3, 7),
      P("Bulgarian Split Squats", 16, 0.25, 2, 3, 10),
      P("Leg Curl", 35, 0.4, 2.5, 3, 11),
      P("Calf Raise", 60, 0.5, 5, 3, 12),
    ],
  },
};

/**
 * Era 2 — the split currently stored in workout_split, followed slot for slot:
 * week = [3, 2, 1, rest, 5, 4, rest], Monday first.
 *
 * 'Legs' keeps day_type 3 across both eras, so it yields ONE history chip rather
 * than two — the dedupe in historyFilterNames, on real-shaped input.
 */
const ERA_2: Record<number, DayPlan> = {
  0: {
    day_type: 3,
    day_name: "Legs",
    exercises: [
      P("Back Squat", 85, 0.6, 2.5, 4, 6),
      P("Romanian Deadlift", 80, 0.6, 2.5, 3, 8),
      P("Leg Press", 140, 1.5, 5, 3, 10),
      P("Leg Curl", 42.5, 0.35, 2.5, 3, 11),
    ],
  },
  1: {
    day_type: 2,
    day_name: "Pull",
    exercises: [
      P("Lat Pulldown", 57.5, 0.5, 2.5, 4, 9),
      P("Seated Cable Row", 55, 0.5, 2.5, 3, 10),
      // The one bodyweight lift: weight_kg 0, progress carried entirely by reps.
      P("Pull-Up", 6, 0.14, 1, 3, 0, true),
      P("Barbell Curl", 30, 0.25, 1.25, 3, 10),
      P("Face Pull", 25, 0.25, 1.25, 3, 14),
    ],
  },
  2: {
    day_type: 1,
    day_name: "Push",
    exercises: [
      P("Bench Press", 72.5, 0.5, 2.5, 4, 7),
      P("Overhead Press", 45, 0.35, 2.5, 3, 8),
      P("Incline Dumbbell Press", 26, 0.25, 2, 3, 9),
      P("Cable Fly", 17.5, 0.2, 1.25, 3, 13),
      P("Tricep Pushdown", 32.5, 0.3, 1.25, 3, 12),
      P("Lateral Raise", 10, 0.12, 1, 4, 14),
    ],
  },
  4: {
    day_type: 5,
    day_name: "Lower",
    exercises: [
      P("Back Squat", 82.5, 0.55, 2.5, 3, 8),
      P("Leg Press", 145, 1.4, 5, 3, 11),
      P("Leg Extension", 45, 0.4, 2.5, 3, 12),
      P("Calf Raise", 75, 0.6, 5, 4, 12),
    ],
  },
  5: {
    day_type: 4,
    day_name: "Upper",
    exercises: [
      P("Bench Press", 70, 0.45, 2.5, 3, 9),
      P("Lat Pulldown", 55, 0.45, 2.5, 3, 10),
      P("Overhead Press", 42.5, 0.3, 2.5, 3, 9),
      P("Seated Cable Row", 52.5, 0.45, 2.5, 3, 11),
      P("Lateral Raise", 9, 0.1, 1, 3, 15),
    ],
  },
};

/**
 * The exercises TEMPLATE, i.e. what the Log tab offers today.
 *
 * Intentionally narrower than the history: every era-1 lift is absent, so the
 * stats picker lists names the template cannot reach. That gap is the Phase 7
 * behaviour worth being able to see.
 */
const TEMPLATE: Record<number, string[]> = {
  1: [
    "Bench Press",
    "Overhead Press",
    "Incline Dumbbell Press",
    "Cable Fly",
    "Tricep Pushdown",
    "Lateral Raise",
  ],
  2: ["Lat Pulldown", "Seated Cable Row", "Pull-Up", "Barbell Curl", "Face Pull"],
  3: ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl"],
  4: ["Bench Press", "Lat Pulldown", "Overhead Press", "Seated Cable Row", "Lateral Raise"],
  5: ["Back Squat", "Leg Press", "Leg Extension", "Calf Raise"],
};

const SESSION_NOTES = [
  "Felt strong today.",
  "Short on time, cut the accessories.",
  "Left shoulder a bit cranky.",
  "Deload week.",
  "Best session in a while.",
];

const CARDIO_KINDS = ["Treadmill", "Stairmaster", "Rowing Machine"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic PRNG, so re-seeding reproduces the same history to compare against. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monday-first weekday of a YYYY-MM-DD string.
 *
 * Built and read in UTC, exactly like shiftISO: the Date here is a calendar
 * cursor and never a local time, so there is no BST edge to fall off.
 */
function weekdayMon(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}

function daysBetween(a: string, b: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * THE PROGRESSION POLICY — the one knob here worth turning.
 *
 * Linear gain, a light week every eighth, and a little day-to-day noise. That
 * keeps the trend line unmistakably positive while leaving the chart something
 * to actually show. Flatten `perWeek`, widen the noise, or drop the deload and
 * the Stats tab tells a different story; this is the only place to change it.
 */
function workingWeight(p: Prescription, week: number, r: number): number {
  const base = p.start + p.perWeek * week;
  const deload = week > 0 && week % 8 === 7 ? 0.9 : 1;
  const noise = 1 + (r - 0.5) * 0.03;
  return Math.max(p.step, roundTo(base * deload * noise, p.step));
}

interface SetRow {
  id: string;
  session_id: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_bodyweight: boolean;
}

interface SessionRow {
  id: string;
  date: string;
  day_type: number;
  day_name: string;
  notes: string | null;
}

interface CardioRow {
  id: string;
  session_id: string;
  exercise: string;
  distance_miles: number | null;
  duration_minutes: number | null;
  speed: number | null;
  incline: number | null;
  calories_burned: number | null;
}

interface WeightRow {
  id: string;
  date: string;
  weight_kg: number;
  notes: string | null;
}

const WEIGHT_NOTES = [
  "Post-holiday.",
  "Morning, after gym.",
  "Felt lighter than this.",
  "Scale on carpet, probably off.",
];

/**
 * Ninety days of weigh-ins ending YESTERDAY, so today is still loggable.
 *
 * THE SHAPE IS THE POINT, and it is the one knob here worth turning. A steady
 * slope would make the OLS trend line sit exactly on the data and the chart
 * would have nothing to say. This is a cut, then a plateau, then a slower cut:
 * the trend runs visibly straight through a middle section that does not.
 *
 * Daily noise is ±0.35 kg, which is roughly real — water alone moves more than
 * a day of deficit does, and a seed without it produces a suspiciously clean
 * line that makes the 7-day delta look far more meaningful than it is.
 */
function generateWeights(rand: () => number, endDate: string): WeightRow[] {
  const DAYS = 90;
  const SKIP_RATE = 0.26;
  const START_KG = 84.5;

  const rows: WeightRow[] = [];
  let trueWeight = START_KG;

  for (let i = 0; i < DAYS; i++) {
    // Walk forward from the start so the trend runs the right way round.
    const date = shiftISO(endDate, -(DAYS - 1 - i));

    // Three phases across the window: cut, plateau, slower cut.
    const perDay = i < 34 ? -0.055 : i < 58 ? -0.004 : -0.032;
    trueWeight += perDay;

    // Not every day gets weighed. Real history has gaps, and a complete series
    // hides the fact that the chart has to cope with them.
    if (rand() < SKIP_RATE) continue;

    const observed = trueWeight + (rand() - 0.5) * 0.7;
    rows.push({
      id: randomUUID(),
      date,
      // One decimal, like a bathroom scale reports.
      weight_kg: Math.round(observed * 10) / 10,
      notes: rand() < 0.06 ? WEIGHT_NOTES[Math.floor(rand() * WEIGHT_NOTES.length)]! : null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function generate(rand: () => number) {
  const sessions: SessionRow[] = [];
  const sets: SetRow[] = [];
  const cardio: CardioRow[] = [];

  for (let date = ERA_1_START; date <= HISTORY_END; date = shiftISO(date, 1)) {
    const era = date < ERA_2_START ? ERA_1 : ERA_2;
    const plan = era[weekdayMon(date)];
    if (!plan) continue;
    if (rand() < MISSED_SESSION_RATE) continue;

    const week = Math.floor(daysBetween(ERA_1_START, date) / 7);
    const session: SessionRow = {
      id: randomUUID(),
      date,
      day_type: plan.day_type,
      day_name: plan.day_name,
      notes: rand() < 0.14 ? SESSION_NOTES[Math.floor(rand() * SESSION_NOTES.length)]! : null,
    };
    sessions.push(session);

    for (const p of plan.exercises) {
      if (p.bodyweight) {
        const top = Math.round(p.start + p.perWeek * week);
        for (let i = 0; i < p.sets; i++) {
          sets.push({
            id: randomUUID(),
            session_id: session.id,
            exercise_name: p.name,
            set_number: i + 1,
            // Forced to 0, per the schema note: branch on the flag, never on
            // the value.
            weight_kg: 0,
            reps: clamp(top - i, 3, 25),
            is_bodyweight: true,
          });
        }
        continue;
      }

      const weight = workingWeight(p, week, rand());
      for (let i = 0; i < p.sets; i++) {
        sets.push({
          id: randomUUID(),
          session_id: session.id,
          exercise_name: p.name,
          set_number: i + 1,
          weight_kg: weight,
          // Reps fall off across straight sets, with the odd extra rep lost.
          reps: clamp(p.topReps - i - (rand() < 0.3 ? 1 : 0), 3, 20),
          is_bodyweight: false,
        });
      }
    }

    const isLegDay = plan.day_type === 3 || plan.day_type === 5;
    if (rand() < (isLegDay ? 0.35 : 0.15)) {
      const minutes = 15 + Math.floor(rand() * 25);
      const speed = Math.round((5 + rand() * 3) * 10) / 10;
      cardio.push({
        id: randomUUID(),
        session_id: session.id,
        exercise: CARDIO_KINDS[Math.floor(rand() * CARDIO_KINDS.length)]!,
        distance_miles: Math.round((minutes / 60) * speed * 100) / 100,
        duration_minutes: minutes,
        speed,
        incline: Math.round(rand() * 6 * 2) / 2,
        calories_burned: Math.round(minutes * (8 + rand() * 4)),
      });
    }
  }

  return { sessions, sets, cardio };
}

/**
 * Two shapes the generator would not produce on its own, planted on purpose.
 *
 * Both are read-path behaviours that only appear against awkward data, so
 * leaving them to chance would mean usually not being able to see them.
 */
function plantEdgeCases(sessions: SessionRow[], sets: SetRow[]): string[] {
  const planted: string[] = [];

  // 1. Six sets of one exercise. The history table derives its column count from
  //    the data; v1's hardcoded four columns would hide the last two.
  const lastLower = [...sessions].reverse().find((s) => s.day_name === "Lower");
  if (lastLower) {
    const calf = sets.filter(
      (s) => s.session_id === lastLower.id && s.exercise_name === "Calf Raise",
    );
    const template = calf[0];
    if (template) {
      for (let n = calf.length + 1; n <= 6; n++) {
        sets.push({ ...template, id: randomUUID(), set_number: n, reps: clamp(16 - n, 6, 20) });
      }
      planted.push(`${lastLower.date} — Calf Raise carried to 6 sets`);
    }
  }

  // 2. A hole in the middle of a row: set 2 removed, leaving 1 and 3. Rendering
  //    by position instead of by set_number would show two sets and silently
  //    relabel set 3 as set 2.
  const gapSession = [...sessions].reverse().find((s) => s.day_name === "Push");
  if (gapSession) {
    const idx = sets.findIndex(
      (s) =>
        s.session_id === gapSession.id &&
        s.exercise_name === "Overhead Press" &&
        s.set_number === 2,
    );
    if (idx !== -1) {
      sets.splice(idx, 1);
      planted.push(`${gapSession.date} — Overhead Press set 2 deleted, leaving a 1/—/3 gap`);
    }
  }

  return planted;
}

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

async function insertRows(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  // Chunked to stay well under Postgres' 65535 bound parameters per statement.
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map((_, r) => `(${columns.map((__, c) => `$${r * columns.length + c + 1}`).join(", ")})`)
      .join(", ");
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values}`,
      chunk.flat(),
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const email = argv.includes("--email") ? argv[argv.indexOf("--email") + 1] : "dev@local.test";
  const reset = argv.includes("--reset");

  if (!SEEDABLE_SCHEMA.test(config.DB_SCHEMA)) {
    throw new Error(
      `Refusing to seed DB_SCHEMA=${config.DB_SCHEMA} - this script WRITES, and only a ` +
        `schema ending in _dev may be written to. v1 in public, production in app and ` +
        `the app_test fixtures are all off limits.`,
    );
  }
  if (!email || email.startsWith("--")) throw new Error("--email needs a value");

  const user = await pool.query<{ id: string }>(
    `SELECT id FROM ${T.users} WHERE lower(email) = lower($1)`,
    [email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error(`No user ${email} in ${config.DB_SCHEMA}.`);

  const existing = await pool.query<{ count: string }>(
    `SELECT count(*) FROM ${T.workoutSessions} WHERE user_id = $1`,
    [userId],
  );
  if (Number(existing.rows[0]!.count) > 0 && !reset) {
    throw new Error(
      `${email} already has ${existing.rows[0]!.count} sessions. ` +
        `Re-run with --reset to replace them.`,
    );
  }

  const rand = mulberry32(20260824);
  const { sessions, sets, cardio } = generate(rand);
  const planted = plantEdgeCases(sessions, sets);
  // Ends on HISTORY_END, the same yesterday the sessions stop at, so today is
  // an empty slate on both the Weight page and Home.
  const weights = generateWeights(rand, HISTORY_END);

  await withTransaction(async (client) => {
    if (reset) {
      // Sets and cardio go with the sessions via ON DELETE CASCADE.
      await client.query(`DELETE FROM ${T.workoutSessions} WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM ${T.exercises} WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM ${T.bodyWeight} WHERE user_id = $1`, [userId]);
    }

    const templateRows = Object.entries(TEMPLATE).flatMap(([dayType, names]) =>
      names.map((name, i) => [userId, Number(dayType), name, i + 1]),
    );
    await insertRows(
      client,
      T.exercises,
      ["user_id", "day_type", "exercise_name", "sort_order"],
      templateRows,
    );

    await insertRows(
      client,
      T.workoutSessions,
      ["id", "user_id", "date", "day_type", "day_name", "notes"],
      sessions.map((s) => [s.id, userId, s.date, s.day_type, s.day_name, s.notes]),
    );

    await insertRows(
      client,
      T.workoutSets,
      [
        "id",
        "user_id",
        "session_id",
        "exercise_name",
        "set_number",
        "weight_kg",
        "reps",
        "is_bodyweight",
      ],
      sets.map((s) => [
        s.id,
        userId,
        s.session_id,
        s.exercise_name,
        s.set_number,
        s.weight_kg,
        s.reps,
        s.is_bodyweight,
      ]),
    );

    await insertRows(
      client,
      T.cardioEntries,
      [
        "id",
        "user_id",
        "session_id",
        "exercise",
        "distance_miles",
        "duration_minutes",
        "speed",
        "incline",
        "calories_burned",
      ],
      cardio.map((c) => [
        c.id,
        userId,
        c.session_id,
        c.exercise,
        c.distance_miles,
        c.duration_minutes,
        c.speed,
        c.incline,
        c.calories_burned,
      ]),
    );

    await insertRows(
      client,
      T.bodyWeight,
      ["id", "user_id", "date", "weight_kg", "notes"],
      weights.map((w) => [w.id, userId, w.date, w.weight_kg, w.notes]),
    );
  });

  const templateNames = new Set(Object.values(TEMPLATE).flat());
  const historyOnly = [...new Set(sets.map((s) => s.exercise_name))]
    .filter((n) => !templateNames.has(n))
    .sort();

  console.log(`Seeded ${email} in ${config.DB_SCHEMA}:`);
  console.log(`  sessions ${sessions.length}  sets ${sets.length}  cardio ${cardio.length}`);
  console.log(
    `  weights ${weights.length}: ${weights[0]!.weight_kg} -> ` +
      `${weights[weights.length - 1]!.weight_kg} kg over ${weights[0]!.date} -> ` +
      `${weights[weights.length - 1]!.date}`,
  );
  console.log(`  ${sessions[0]!.date} -> ${sessions[sessions.length - 1]!.date}`);
  console.log(`  day names: ${[...new Set(sessions.map((s) => s.day_name))].join(", ")}`);
  console.log(`  history-only exercises (${historyOnly.length}): ${historyOnly.join(", ")}`);
  for (const p of planted) console.log(`  planted: ${p}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
