-- Corrects 004's CHECK, which let one side alone through. LEAST ignores NULL
-- and `NULL > 0` is NULL, so (reps 6, left 6, right NULL) evaluated to NULL,
-- and a CHECK passes on NULL. Both sides must be stated NOT NULL explicitly.
--
-- A separate migration rather than an edit to 004: 004 was already recorded as
-- applied in app_dev and app_test, so an edited 004 would never reach them.
ALTER TABLE workout_sets
  DROP CONSTRAINT workout_sets_sides,
  ADD CONSTRAINT workout_sets_sides CHECK (
    (reps_left IS NULL AND reps_right IS NULL)
    OR (reps_left IS NOT NULL AND reps_right IS NOT NULL
        AND reps_left > 0 AND reps_right > 0 AND reps = LEAST(reps_left, reps_right))
  );
