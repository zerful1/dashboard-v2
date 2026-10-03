-- Targets the Insights page projects toward: one body weight, and lifts.
CREATE TABLE goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('weight', 'lift')),
  exercise_name text,
  target_kg     numeric NOT NULL CHECK (target_kg > 0 AND target_kg <= 500),
  -- The value when the goal was set: the latest weigh-in, or the lift's heaviest
  -- set ever. Gives a weight goal its direction (down or up) and lets "reached"
  -- be judged. NULL when there was nothing to measure yet.
  start_kg      numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'weight') = (exercise_name IS NULL))
);

-- One weight goal, and one goal per lift.
CREATE UNIQUE INDEX goals_one_per_target ON goals (user_id, kind, (coalesce(exercise_name, '')));
