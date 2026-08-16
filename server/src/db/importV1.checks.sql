-- Read-only. Every row returned is a blocker; zero rows everywhere means the
-- migration will not violate a constraint.
--
-- The v2 schema adds constraints v1 never had. Running these first turns a
-- mid-transaction abort into a readable list of blockers.
--
-- :'v1user' is substituted by the runner from V1_USER_ID rather than being
-- hardcoded, so this file cannot drift from the id the migration actually uses.
-- The real account is 440f3884-235c-4062-9eb0-2b52fcfb93c3 (991 of 993 sets);
-- the other two ids in public are abandoned accounts.

\set v1user '440f3884-235c-4062-9eb0-2b52fcfb93c3'

-- 1. UNIQUE (user_id, date) on body_weight — new in v2
SELECT 'body_weight duplicate day' AS check, date, count(*)
FROM public.body_weight WHERE user_id = :'v1user'
GROUP BY date HAVING count(*) > 1;

-- 2. UNIQUE (user_id, date, day_type) on workout_sessions
SELECT 'session duplicate day+type' AS check, date, day_type, count(*)
FROM public.workout_sessions WHERE user_id = :'v1user'
GROUP BY date, day_type HAVING count(*) > 1;

-- 3. UNIQUE (session_id, exercise_name, set_number) on workout_sets
SELECT 'set duplicate triple' AS check, session_id, exercise_name, set_number, count(*)
FROM public.workout_sets WHERE user_id = :'v1user'
GROUP BY session_id, exercise_name, set_number HAVING count(*) > 1;

-- 4. UNIQUE (habit_id, completed_date)
SELECT 'habit completion duplicate' AS check, habit_id, completed_date, count(*)
FROM public.habit_completions WHERE user_id = :'v1user'
GROUP BY habit_id, completed_date HAVING count(*) > 1;

-- 5. UNIQUE (user_id, external_source, external_id) on food_items.
--    NULL external_id does not collide under UNIQUE, so only non-null matter.
SELECT 'food_item duplicate source+id' AS check, external_source, external_id, count(*)
FROM public.food_items WHERE user_id = :'v1user' AND external_id IS NOT NULL
GROUP BY external_source, external_id HAVING count(*) > 1;

-- 6. CHECK reps > 0 and weight_kg >= 0
SELECT 'set fails CHECK' AS check, id, exercise_name, weight_kg, reps
FROM public.workout_sets
WHERE user_id = :'v1user' AND (reps <= 0 OR weight_kg < 0);

-- 7. CHECK weight_kg > 0 on body_weight
SELECT 'body_weight fails CHECK' AS check, id, date, weight_kg
FROM public.body_weight WHERE user_id = :'v1user' AND weight_kg <= 0;

-- 8. CHECK goal_mode / unit / external_source / media.type
SELECT 'bad goal_mode' AS check, id, goal_mode FROM public.nutrition_targets
WHERE user_id = :'v1user' AND goal_mode NOT IN ('cut','maintain','bulk');

SELECT 'bad food unit' AS check, id, unit FROM public.food_log_entries
WHERE user_id = :'v1user' AND unit NOT IN ('serving','g');

SELECT 'bad external_source' AS check, id, external_source FROM public.food_items
WHERE user_id = :'v1user' AND external_source NOT IN ('off','cofid','manual');

-- 9. FK targets exist: every set's session, every completion's habit
SELECT 'set with missing session' AS check, s.id
FROM public.workout_sets s
LEFT JOIN public.workout_sessions ss ON ss.id = s.session_id
WHERE s.user_id = :'v1user' AND ss.id IS NULL;

SELECT 'cardio with missing session' AS check, c.id
FROM public.cardio_sessions c
LEFT JOIN public.workout_sessions ss ON ss.id = c.session_id
WHERE c.user_id = :'v1user' AND ss.id IS NULL;

SELECT 'completion with missing habit' AS check, hc.id
FROM public.habit_completions hc
LEFT JOIN public.habits h ON h.id = hc.habit_id
WHERE hc.user_id = :'v1user' AND h.id IS NULL;

-- 10. Rows owned by the real user but pointing at another user's parent —
--     would silently migrate a foreign session into this account.
SELECT 'cross-user session reference' AS check, s.id
FROM public.workout_sets s
JOIN public.workout_sessions ss ON ss.id = s.session_id
WHERE s.user_id = :'v1user' AND ss.user_id <> :'v1user';
