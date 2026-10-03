-- Left/right reps for single-sided exercises. Additive: existing rows keep both
-- new columns NULL and read exactly as before.
--
-- `reps` keeps its meaning, "the reps that count", and on a single-sided set
-- that is the LOWER side (the user's call, 2026-10-03). Every stat, PR, chart
-- and coaching rule already reads `reps`, so none of them changes. The CHECK
-- makes the rule the database's, not each writer's: both sides or neither, and
-- the counted number always the lower.
ALTER TABLE workout_sets
  ADD COLUMN reps_left  smallint,
  ADD COLUMN reps_right smallint,
  ADD CONSTRAINT workout_sets_sides CHECK (
    (reps_left IS NULL AND reps_right IS NULL)
    OR (reps_left > 0 AND reps_right > 0 AND reps = LEAST(reps_left, reps_right))
  );
