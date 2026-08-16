-- Domain tables. Mirrors v1's shape so history migrates verbatim, with four
-- deliberate departures, each noted at its table.

-- ===========================================================================
-- Body weight and photos
-- ===========================================================================

CREATE TABLE body_weight (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  weight_kg  numeric NOT NULL CHECK (weight_kg > 0),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- v1 had no such constraint; two weigh-ins on one day is a mis-entry, and
  -- the client already edits today's row rather than adding a second.
  UNIQUE (user_id, date)
);

CREATE INDEX body_weight_user_date_idx ON body_weight (user_id, date DESC);

CREATE TABLE progress_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  date         date NOT NULL,
  weight_kg    numeric,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX progress_photos_user_date_idx ON progress_photos (user_id, date DESC);

-- ===========================================================================
-- Training
-- ===========================================================================

-- The exercise template. Deliberately NOT referenced by workout_sets — see the
-- note there.
CREATE TABLE exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_type      smallint NOT NULL,
  exercise_name text NOT NULL,
  sort_order    smallint NOT NULL
);

CREATE INDEX exercises_user_day_idx ON exercises (user_id, day_type, sort_order);

CREATE TABLE workout_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  day_type   smallint NOT NULL,
  -- Snapshotted at log time. day_type is REUSED across split eras — in the
  -- migrated history 'Upper A' and 'Legs' are both day_type 1, and 'Upper B'
  -- and 'Pull' are both 2. Only day_name distinguishes them, which is why
  -- every historical view reads this column rather than resolving day_type.
  day_name   text NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, day_type)
);

CREATE INDEX workout_sessions_user_date_idx ON workout_sessions (user_id, date DESC);

CREATE TABLE workout_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  -- Denormalised by design, with NO foreign key to exercises. Exercises get
  -- removed from the template over time; the real account has 28 template rows
  -- but 991 sets spanning many more names. A FK would either block template
  -- deletion or destroy history.
  exercise_name text NOT NULL,
  set_number    smallint NOT NULL,
  -- Forced to 0 at write time when is_bodyweight, and ignored at every read
  -- site. Branch on the flag, never on the value.
  weight_kg     numeric NOT NULL CHECK (weight_kg >= 0),
  reps          smallint NOT NULL CHECK (reps > 0),
  is_bodyweight boolean NOT NULL DEFAULT false,
  UNIQUE (session_id, exercise_name, set_number)
);

CREATE INDEX workout_sets_session_idx  ON workout_sets (session_id);
CREATE INDEX workout_sets_user_name_idx ON workout_sets (user_id, exercise_name);

-- RENAMED from v1's `cardio_sessions`, which was a misnomer: rows are entries
-- belonging to a session, not sessions.
CREATE TABLE cardio_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id       uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise         text NOT NULL,
  distance_miles   numeric,
  duration_minutes smallint,
  speed            numeric,
  incline          numeric,
  calories_burned  smallint
);

CREATE INDEX cardio_entries_session_idx ON cardio_entries (session_id);

-- One mutable row per user. `week` is length-7 Monday-first, so there is no
-- anchor date.
CREATE TABLE workout_split (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- Habits
-- ===========================================================================

CREATE TABLE habits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  emoji      text,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX habits_user_sort_idx ON habits (user_id, sort_order);

CREATE TABLE habit_completions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id       uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completed_date date NOT NULL,
  UNIQUE (habit_id, completed_date)
);

CREATE INDEX habit_completions_user_date_idx ON habit_completions (user_id, completed_date DESC);

-- ===========================================================================
-- Nutrition
-- ===========================================================================

-- Insert-only, dated rows. latestActiveTarget(rows, date) in shared is the sole
-- resolver for "the active target on day D" — never query this directly.
CREATE TABLE nutrition_targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  goal_mode      text NOT NULL CHECK (goal_mode IN ('cut', 'maintain', 'bulk')),
  calories       integer NOT NULL CHECK (calories > 0),
  protein_g      integer NOT NULL CHECK (protein_g >= 0),
  fat_g          integer NOT NULL CHECK (fat_g >= 0),
  carbs_g        integer NOT NULL CHECK (carbs_g >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nutrition_targets_user_from_idx ON nutrition_targets (user_id, effective_from DESC);

CREATE TABLE food_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  brand               text,
  serving_description text,
  serving_grams       numeric,
  kcal_per_serving    numeric,
  protein_per_serving numeric,
  fat_per_serving     numeric,
  carbs_per_serving   numeric,
  kcal_per_100g       numeric,
  protein_per_100g    numeric,
  fat_per_100g        numeric,
  carbs_per_100g      numeric,
  is_favourite        boolean NOT NULL DEFAULT false,
  -- v1 also permitted 'usda', retired because USDA carbs include fibre and UK
  -- labels do not. The real account has only 'manual' and 'off', so nothing
  -- needs normalising — but the CHECK makes the retirement permanent.
  external_source     text NOT NULL DEFAULT 'manual'
                      CHECK (external_source IN ('off', 'cofid', 'manual')),
  external_id         text,
  barcode             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_source, external_id)
);

CREATE INDEX food_items_user_fav_idx ON food_items (user_id, is_favourite);

-- name and macros are snapshotted at write time. The diary never joins back to
-- food_items, so renaming or deleting a food never rewrites history.
CREATE TABLE food_log_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  logged_at    timestamptz NOT NULL DEFAULT now(),
  -- Nullable, and ON DELETE SET NULL: deleting a library item must not delete
  -- the diary history that referenced it.
  food_item_id uuid REFERENCES food_items(id) ON DELETE SET NULL,
  name         text NOT NULL,
  quantity     numeric NOT NULL CHECK (quantity > 0),
  unit         text NOT NULL CHECK (unit IN ('serving', 'g')),
  calories     numeric NOT NULL,
  protein_g    numeric NOT NULL,
  fat_g        numeric NOT NULL,
  carbs_g      numeric NOT NULL
);

CREATE INDEX food_log_entries_user_date_idx ON food_log_entries (user_id, date DESC);

-- ===========================================================================
-- Media
-- ===========================================================================

-- `status` is plain text on purpose: the allowed sets differ by type and live
-- in shared/src/domain/media.ts, which the client and server both import.
CREATE TABLE media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('film', 'series', 'game')),
  name             text NOT NULL,
  status           text NOT NULL,
  rating           numeric(3,1) CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10)),
  last_played      date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  replay_dismissed boolean NOT NULL DEFAULT false
);

CREATE INDEX media_user_type_idx ON media (user_id, type);

CREATE TABLE media_seasons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id         uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  season_number    integer NOT NULL,
  episodes_watched integer,
  rating           numeric(3,1) CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10)),
  -- Lets add-and-edit be one upsert path.
  UNIQUE (media_id, season_number)
);

-- ===========================================================================
-- Reference data
-- ===========================================================================

-- CoFID 2021, the UK government's generic-food composition table. Global and
-- read-only: no user_id, and no RLS analogue needed because there is nothing
-- user-specific to scope.
CREATE TABLE cofid_foods (
  food_code        text PRIMARY KEY,
  name             text NOT NULL,
  food_group       text,
  kcal_per_100g    numeric,
  protein_per_100g numeric,
  fat_per_100g     numeric,
  carbs_per_100g   numeric
);

CREATE INDEX cofid_foods_name_idx ON cofid_foods USING gin (to_tsvector('english', name));
