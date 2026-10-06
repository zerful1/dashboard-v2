// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  created_at: string;
}

/**
 * Units are a display concern only — everything is stored in kg and converted at
 * render time. Storing user-dependent units would put a conversion in the path of
 * every aggregate.
 */
export type WeightUnit = "kg" | "lb";

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extra";

export interface Profile {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  units: WeightUnit;
  timezone: string;
  updated_at: string;
  // Optional body details. Used only by the nutrition TDEE hint, and null
  // until the user chooses to give them.
  height_cm: number | null;
  birth_year: number | null;
  sex: Sex | null;
  activity_level: ActivityLevel | null;
}

// ---------------------------------------------------------------------------
// Body weight & photos
// ---------------------------------------------------------------------------

export interface BodyWeightEntry {
  id: string;
  user_id: string;
  date: string; // ISO date: 'YYYY-MM-DD'
  weight_kg: number;
  notes: string | null;
  created_at: string;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  storage_path: string;
  date: string; // 'YYYY-MM-DD'
  weight_kg: number | null;
  notes: string | null;
  created_at: string;
  signedUrl: string; // resolved on read, not stored
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string;
  user_id: string;
  day_type: number;
  exercise_name: string;
  sort_order: number;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  date: string;
  day_type: number;
  day_name: string; // snapshotted at log time; old sessions keep their original split's name
  notes: string | null;
  created_at: string;
}

/** A target the Insights page projects toward (006_goals). */
export interface Goal {
  id: string;
  user_id: string;
  kind: "weight" | "lift";
  /** Null for the weight goal. */
  exercise_name: string | null;
  target_kg: number;
  /** The latest weigh-in, or the lift's heaviest set, when the goal was set. */
  start_kg: number | null;
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  user_id: string;
  session_id: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  /** The reps that count: on a single-sided set, the lower side (004_unilateral_sets). */
  reps: number;
  /** Both or neither, and only on a single-sided set. */
  reps_left: number | null;
  reps_right: number | null;
  is_bodyweight: boolean;
}

/**
 * One cardio entry within a session. Named for what it is — v1 called the table
 * `cardio_sessions`, which was a misnomer since it stores entries keyed by session.
 */
export interface CardioEntry {
  id: string;
  user_id: string;
  session_id: string;
  exercise: string;
  distance_miles: number | null;
  duration_minutes: number | null;
  speed: number | null;
  incline: number | null;
  calories_burned: number | null;
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
  created_at: string;
}

export interface HabitCompletion {
  id: string;
  user_id: string;
  habit_id: string;
  completed_date: string;
}

/** GET /api/habits: a habit with what the screens show of it. */
export interface HabitSummary extends Habit {
  /** Consecutive days ending today or yesterday (calculateStreak). */
  streak: number;
  /** Days done within the 7 days ending today, ascending. */
  recent: string[];
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type GoalMode = "cut" | "maintain" | "bulk";

export interface NutritionTarget {
  id: string;
  user_id: string;
  effective_from: string; // 'YYYY-MM-DD'
  goal_mode: GoalMode;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  created_at: string;
}

/**
 * All sources follow UK convention (carbs exclude fibre). USDA was dropped in v1
 * for that reason and is not carried into v2 — the importer normalises any legacy
 * 'usda' rows to 'off'.
 */
export type FoodExternalSource = "off" | "cofid" | "manual";

/**
 * Fibre, sugar, saturated fat and salt, in grams, on the search wire format.
 * Optional so existing literals stay valid; absent and null both mean UNKNOWN,
 * never zero.
 */
export interface LabelValues {
  fibre?: number | null;
  sugar?: number | null;
  satFat?: number | null;
  salt?: number | null;
}

/** Label-nutrient grams snapshotted onto a diary entry. NULL = unknown, never zero. */
export interface LabelTotals {
  fibre_g: number | null;
  sugar_g: number | null;
  sat_fat_g: number | null;
  salt_g: number | null;
}

export interface FoodItem {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  serving_description: string | null;
  serving_grams: number | null;
  kcal_per_serving: number | null;
  protein_per_serving: number | null;
  fat_per_serving: number | null;
  carbs_per_serving: number | null;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  fat_per_100g: number | null;
  carbs_per_100g: number | null;
  fibre_per_100g: number | null;
  sugar_per_100g: number | null;
  sat_fat_per_100g: number | null;
  salt_per_100g: number | null;
  fibre_per_serving: number | null;
  sugar_per_serving: number | null;
  sat_fat_per_serving: number | null;
  salt_per_serving: number | null;
  is_favourite: boolean;
  external_source: FoodExternalSource;
  external_id: string | null;
  barcode: string | null;
  created_at: string;
}

export type FoodLogUnit = "serving" | "g";

/**
 * Name and macros are snapshotted at write time — the diary never joins back
 * through food_items, so renaming or deleting a food never rewrites history.
 */
export interface FoodLogEntry extends LabelTotals {
  id: string;
  user_id: string;
  date: string; // 'YYYY-MM-DD'
  logged_at: string; // ISO timestamp
  food_item_id: string | null;
  name: string;
  quantity: number;
  unit: FoodLogUnit;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

/**
 * A single serving option on a food-search hit.
 *
 * Lived in the client's useFoodSearch hook in v1, which meant the pure domain
 * module `nutrition/serving.ts` imported types from a React hook. Moved here so the
 * domain layer is importable by the server.
 *
 * The short macro keys (p/f/c) are the wire format the food-search Edge Function
 * already returns; kept verbatim so neither the function nor `resolveMacros` has to
 * change during the port.
 */
export interface FoodHitServing extends LabelValues {
  label: string;
  grams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
}

/** `source` is narrower than FoodExternalSource — search only ever yields these two. */
export interface FoodHit {
  source: "off" | "cofid";
  externalId: string;
  name: string;
  brand?: string;
  /** Set when the hit came from a barcode lookup. */
  barcode?: string;
  servings: FoodHitServing[];
  per100g: ({ kcal: number; p: number; f: number; c: number } & LabelValues) | null;
}

export interface FoodSearchResult {
  hits: FoodHit[];
  warnings?: string[];
}

/**
 * GET /api/food/barcode/:code. A food already in the library comes back as
 * the item itself, so logging it links to the row rather than storing a copy.
 */
export type BarcodeResult = { source: "library"; item: FoodItem } | { source: "off"; hit: FoodHit };

/** The nutrition a food carries, per serving and per 100 g. */
export type FoodNutrition = Pick<
  FoodItem,
  | "serving_description" | "serving_grams"
  | "kcal_per_serving" | "protein_per_serving" | "fat_per_serving" | "carbs_per_serving"
  | "kcal_per_100g" | "protein_per_100g" | "fat_per_100g" | "carbs_per_100g"
  | "fibre_per_100g" | "sugar_per_100g" | "sat_fat_per_100g" | "salt_per_100g"
  | "fibre_per_serving" | "sugar_per_serving" | "sat_fat_per_serving" | "salt_per_serving"
>;

/** A food to store in the user's library as an entry is logged. */
export interface FoodInput extends FoodNutrition {
  source: FoodExternalSource;
  /** The search source's own id. Null exactly when source is 'manual'. */
  external_id: string | null;
  name: string;
  brand: string | null;
  /** The packet's barcode, when it was scanned or typed; never cleared once stored. */
  barcode?: string | null;
}

/** POST /api/nutrition/diary. Send at most one of food_item_id and food. */
export interface DiaryEntryInput extends LabelTotals {
  date: string; // 'YYYY-MM-DD', the day chosen on the client
  name: string;
  quantity: number;
  unit: FoodLogUnit;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  /** Link to a food already in the caller's library... */
  food_item_id?: string;
  /** ...or store this one there first. */
  food?: FoodInput;
}

export type TargetInput = Pick<
  NutritionTarget,
  "effective_from" | "goal_mode" | "calories" | "protein_g" | "fat_g" | "carbs_g"
>;

export interface RecentFood {
  /** The most recent entry for this food; its amount is the default next time. */
  entry: FoodLogEntry;
  /** The library item, when the entry was linked to one. */
  item: FoodItem | null;
}

export interface TdeeHint {
  formula: { kcal: number; weight_kg: number; age: number } | null;
  adaptive: { kcal: number; days_logged: number; weigh_ins: number } | null;
  /** Days with any food in the 28-day window, for "N of 14" while adaptive is null. */
  days_logged: number;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaType = "film" | "series" | "game";

// Status sets are enforced in app logic (domain/media.ts), not the DB — the
// `status` column is plain text. Films/series and games share Completed / Paused /
// Dropped but differ on their "active" + "planned" labels.
export type WatchStatus = "Watching" | "Plan to Watch" | "Completed" | "Paused" | "Dropped";
export type GameStatus = "Playing" | "Plan to Play" | "Completed" | "Paused" | "Dropped";
export type MediaStatus = WatchStatus | GameStatus;

export interface Media {
  id: string;
  user_id: string;
  type: MediaType;
  name: string;
  status: MediaStatus;
  rating: number | null; // 1.0–10.0, numeric(3,1)
  last_played: string | null; // 'YYYY-MM-DD' (games)
  notes: string | null;
  created_at: string;
  updated_at: string;
  replay_dismissed: boolean;
}

export interface MediaSeason {
  id: string;
  user_id: string;
  media_id: string;
  season_number: number;
  episodes_watched: number | null;
  rating: number | null; // 1.0–10.0 — per-season verdict; series rating is separate
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * GET /api/export: everything a user owns, as Postgres serialised it. Rows are
 * deliberately untyped. The file mirrors the database, whatever its columns
 * are on the day, and `version` is what a later import reads to know the shape.
 */
export interface ExportFile {
  format: "dashboard-export";
  version: 1;
  exported_at: string;
  account: { id: string; email: string; created_at: string };
  /** Keyed by database table name; every value is an array, even for one-row tables. */
  tables: Record<string, Record<string, unknown>[]>;
}
