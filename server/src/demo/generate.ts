import { DEFAULT_SPLIT, getDayName, shiftISO } from "@dashboard/shared";

/**
 * A believable, entirely fictional person for the read-only demo: 16 weeks of
 * training, weigh-ins and three weeks of food, ending yesterday. Pure and
 * deterministic - the same person every time, with the dates moved to `today` -
 * so refresh.ts can swap it in, and tests can pin it.
 */

export const DEMO_WEEKS = 16;

export interface DemoSession { key: number; date: string; day_type: number; day_name: string; notes: string | null }
export interface DemoSet {
  session: number; exercise_name: string; set_number: number; weight_kg: number; reps: number;
  reps_left: number | null; reps_right: number | null; is_bodyweight: boolean;
}
export interface DemoCardio {
  session: number; exercise: string; distance_miles: number; duration_minutes: number;
  speed: number; incline: number; calories_burned: number;
}
export interface DemoFood {
  date: string; logged_at: string; name: string; quantity: number; unit: "g" | "serving";
  calories: number; protein_g: number; fat_g: number; carbs_g: number;
  fibre_g: number; sugar_g: number; sat_fat_g: number; salt_g: number;
}
export interface DemoData {
  exercises: { day_type: number; exercise_name: string; sort_order: number }[];
  sessions: DemoSession[];
  sets: DemoSet[];
  cardio: DemoCardio[];
  weights: { date: string; weight_kg: number }[];
  food: DemoFood[];
  target: { effective_from: string; goal_mode: "cut"; calories: number; protein_g: number; fat_g: number; carbs_g: number };
  goals: { kind: "weight" | "lift"; exercise_name: string | null; target_kg: number; start_kg: number }[];
  habits: { name: string; emoji: string; sort_order: number }[];
  /** Each a day one habit was done, by its index in `habits`. */
  habitDays: { habit: number; date: string }[];
}

interface Lift {
  name: string;
  /** kg in the first week; 0 for bodyweight. */
  start: number;
  /** kg added every third week (bodyweight: a rep every fourth week). */
  step: number;
  reps: number;
  bodyweight?: true;
  unilateral?: true;
}

// The default split's days: 1 Legs, 2 Pull, 3 Push, 4 Lower, 5 Upper.
const DAYS: Record<number, Lift[]> = {
  3: [
    { name: "Bench Press", start: 70, step: 2.5, reps: 8 },
    { name: "Incline Dumbbell Press", start: 26, step: 2, reps: 10 },
    { name: "Machine Shoulder Press", start: 40, step: 2.5, reps: 10 },
    { name: "Cable Lateral Raises", start: 9, step: 1, reps: 12 },
    { name: "V Bar Tricep Extension", start: 30, step: 2.5, reps: 12 },
  ],
  2: [
    { name: "Lat Pulldown", start: 60, step: 2.5, reps: 10 },
    { name: "Seated Cable Row", start: 58, step: 2.5, reps: 10 },
    { name: "Unilateral Machine Row", start: 36, step: 2.5, reps: 10, unilateral: true },
    { name: "Machine Preacher Curl", start: 30, step: 2.5, reps: 10 },
    { name: "Pull Ups", start: 0, step: 1, reps: 6, bodyweight: true },
  ],
  1: [
    { name: "Hack Squat", start: 90, step: 5, reps: 8 },
    { name: "Leg Extension", start: 60, step: 5, reps: 12 },
    { name: "Seated Leg Curl", start: 50, step: 2.5, reps: 10 },
    { name: "45 Extension", start: 0, step: 1, reps: 12, bodyweight: true },
    { name: "Standing Calf Raises", start: 80, step: 5, reps: 12 },
  ],
  4: [
    { name: "Leg Press", start: 160, step: 10, reps: 10 },
    { name: "Romanian Deadlift", start: 80, step: 5, reps: 8 },
    { name: "Lying Leg Curl", start: 40, step: 2.5, reps: 10 },
    { name: "Bulgarian Split Squats", start: 14, step: 2, reps: 8, unilateral: true },
    { name: "Machine Adduction", start: 50, step: 5, reps: 12 },
  ],
  5: [
    { name: "Machine Chest Press", start: 60, step: 2.5, reps: 10 },
    { name: "T Bar Row", start: 40, step: 2.5, reps: 10 },
    { name: "Machine Shoulder Press", start: 40, step: 2.5, reps: 10 },
    { name: "Cable Curl", start: 20, step: 2.5, reps: 12 },
    { name: "Cable Lateral Raises", start: 9, step: 1, reps: 12 },
  ],
};

const food = (name: string, quantity: number, unit: "g" | "serving",
  calories: number, protein_g: number, fat_g: number, carbs_g: number,
  fibre_g: number, sugar_g: number, sat_fat_g: number, salt_g: number) =>
  ({ name, quantity, unit, calories, protein_g, fat_g, carbs_g, fibre_g, sugar_g, sat_fat_g, salt_g });

// Real per-portion values, rounded.
const BREAKFASTS = [
  [food("Porridge Oats", 100, "g", 375, 13, 7, 66, 9, 1, 1.3, 0),
   food("Greek Yogurt, 0% fat", 200, "g", 146, 20, 0.8, 7.6, 0, 7.6, 0.4, 0.1),
   food("Banana", 1, "serving", 105, 1.3, 0.4, 27, 3.1, 14, 0.1, 0)],
  [food("Eggs, boiled", 3, "serving", 234, 18.9, 15.9, 1.8, 0, 0.6, 4.8, 0.5),
   food("Wholemeal Toast", 2, "serving", 190, 8, 2.4, 34, 5.4, 3, 0.5, 0.8),
   food("Peanut Butter", 20, "g", 120, 5, 10, 3, 1.4, 1.2, 1.6, 0.1)],
];
const LUNCH = [
  food("Chicken Breast", 180, "g", 297, 55.8, 6.5, 0, 0, 0, 1.8, 0.2),
  food("Basmati Rice, cooked", 250, "g", 325, 6.8, 0.8, 70, 1, 0.3, 0.2, 0),
  food("Broccoli", 100, "g", 34, 2.8, 0.4, 7, 2.6, 1.7, 0.1, 0),
];
const SNACK = [
  food("Whey Protein Shake", 1, "serving", 120, 24, 1.5, 3, 0, 2, 0.8, 0.3),
  food("Apple", 1, "serving", 95, 0.5, 0.3, 25, 4.4, 19, 0, 0),
];
const DINNERS = [
  [food("Salmon Fillet", 150, "g", 312, 30, 20.7, 0, 0, 0, 4.4, 0.2),
   food("New Potatoes", 300, "g", 225, 5.4, 0.6, 50.4, 4.5, 3, 0.1, 0)],
  [food("Beef Mince 5%", 180, "g", 252, 38.5, 9, 0, 0, 0, 3.8, 0.3),
   food("Wholewheat Pasta, cooked", 250, "g", 375, 14.8, 2.5, 75, 9.5, 2.5, 0.5, 0)],
];

/** mulberry32: a tiny seeded PRNG, so the same person comes back every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mondayIndex = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export function generateDemo(today: string): DemoData {
  const rand = seeded(20261006);
  const yesterday = shiftISO(today, -1);
  const start = shiftISO(today, -7 * DEMO_WEEKS);

  const exercises = Object.entries(DAYS).flatMap(([dayType, lifts]) =>
    lifts.map((l, i) => ({ day_type: Number(dayType), exercise_name: l.name, sort_order: i + 1 })));

  const sessions: DemoSession[] = [];
  const sets: DemoSet[] = [];
  const cardio: DemoCardio[] = [];
  for (let date = start, day = 0; date <= yesterday; date = shiftISO(date, 1), day++) {
    const slot = DEFAULT_SPLIT.week[mondayIndex(date)];
    if (slot === undefined || slot === "rest") continue;
    // About one session in seven is missed, as in a real training log.
    if (rand() < 0.15) continue;
    const key = sessions.length;
    const week = Math.floor(day / 7);
    sessions.push({ key, date, day_type: slot, day_name: getDayName(DEFAULT_SPLIT, slot), notes: rand() < 0.1 ? "Felt strong today" : null });
    for (const lift of DAYS[slot]!) {
      const weight = lift.bodyweight ? 0 : round1(lift.start + lift.step * Math.floor(week / 3));
      const base = lift.bodyweight ? lift.reps + Math.floor(week / 4) : lift.reps;
      for (let n = 1; n <= 3; n++) {
        // Reps fall a little across sets, with day-to-day wobble.
        const reps = Math.max(3, base - (n - 1) - (rand() < 0.3 ? 1 : 0));
        if (lift.unilateral) {
          const right = Math.max(3, reps - (rand() < 0.5 ? 1 : 0));
          sets.push({ session: key, exercise_name: lift.name, set_number: n, weight_kg: weight,
            reps: Math.min(reps, right), reps_left: reps, reps_right: right, is_bodyweight: false });
        } else {
          sets.push({ session: key, exercise_name: lift.name, set_number: n, weight_kg: weight,
            reps, reps_left: null, reps_right: null, is_bodyweight: !!lift.bodyweight });
        }
      }
    }
    if ((slot === 4 || slot === 5) && rand() < 0.5) {
      cardio.push({ session: key, exercise: "Incline Treadmill", distance_miles: 0.2, duration_minutes: 5,
        speed: 3.5, incline: 12, calories_burned: 45 });
    }
  }

  // Near-daily weigh-ins drifting from ~84 to ~80 kg. Yesterday always has one:
  // refresh.ts decides staleness by the newest weigh-in.
  const weights: DemoData["weights"] = [];
  const totalDays = 7 * DEMO_WEEKS;
  for (let date = start, day = 0; date <= yesterday; date = shiftISO(date, 1), day++) {
    const skip = rand() < 0.15;
    const noise = (rand() - 0.5) * 1.2;
    if (skip && date !== yesterday) continue;
    weights.push({ date, weight_kg: round1(84 - (4 * day) / (totalDays - 1) + noise) });
  }

  const foodRows: DemoFood[] = [];
  for (let back = 21; back >= 1; back--) {
    const date = shiftISO(today, -back);
    const meals: [string, ReturnType<typeof food>[]][] = [
      ["08:00", BREAKFASTS[rand() < 0.5 ? 0 : 1]!],
      ["12:30", LUNCH],
      ...(rand() < 0.8 ? [["16:00", SNACK] as [string, ReturnType<typeof food>[]]] : []),
      ["19:00", DINNERS[rand() < 0.5 ? 0 : 1]!],
    ];
    for (const [time, items] of meals) {
      items.forEach((f, i) => foodRows.push({ ...f, date, logged_at: `${date}T${time}:0${i}.000Z` }));
    }
  }

  // Their own stream: drawing from `rand` would shift every value after it and
  // change the rest of the demo, along with the figures its tests pin.
  const habitRand = seeded(20261013);
  const habits = [
    { name: "Stretch 10 min", emoji: "🧘", sort_order: 1 },
    { name: "Read 20 pages", emoji: "📖", sort_order: 2 },
  ];
  const habitDays: DemoData["habitDays"] = [];
  for (let back = 21; back >= 1; back--) {
    const date = shiftISO(today, -back);
    habits.forEach((_, habit) => {
      // Drawn every day, so yesterday's guarantee doesn't move the stream.
      const hit = habitRand() < 0.8;
      // Yesterday always done, so the demo's Home shows real streaks. Today is never done.
      if (hit || back === 1) habitDays.push({ habit, date });
    });
  }

  const best = (name: string, since: string) => Math.max(...sets
    .filter((s) => s.exercise_name === name && sessions[s.session]!.date > since).map((s) => s.weight_kg));
  const ever = (name: string) => Math.max(...sets.filter((s) => s.exercise_name === name).map((s) => s.weight_kg));
  const recent = shiftISO(today, -28);

  return {
    exercises,
    sessions,
    sets,
    cardio,
    weights,
    food: foodRows,
    habits,
    habitDays,
    target: { effective_from: start, goal_mode: "cut", calories: 2300, protein_g: 170, fat_g: 70, carbs_g: 230 },
    goals: [
      { kind: "weight", exercise_name: null, target_kg: 78, start_kg: weights[0]!.weight_kg },
      { kind: "lift", exercise_name: "Bench Press", target_kg: best("Bench Press", recent) + 5, start_kg: ever("Bench Press") },
      { kind: "lift", exercise_name: "Lat Pulldown", target_kg: best("Lat Pulldown", recent) + 7.5, start_kg: ever("Lat Pulldown") },
    ],
  };
}
