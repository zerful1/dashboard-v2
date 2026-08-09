// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export type WeightUnit = "kg" | "lb";

/**
 * Units are a display concern only — everything is stored in kg and converted at
 * render time. Storing user-dependent units would put a conversion in the path of
 * every aggregate.
 */
export interface Profile {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  units: WeightUnit;
  timezone: string;
  updated_at: string;
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

export interface WorkoutSet {
  id: string;
  user_id: string;
  session_id: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps: number;
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
export interface FoodLogEntry {
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
export interface FoodHitServing {
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
  servings: FoodHitServing[];
  per100g: { kcal: number; p: number; f: number; c: number } | null;
}

export interface FoodSearchResult {
  hits: FoodHit[];
  warnings?: string[];
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
