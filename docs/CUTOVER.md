# Cutover: v1 → v2

**Cut over on:** 2026-08-25
**v1 retired on:** 2026-10-20 (housekeeping 5)

## Retired

v1's 19 tables in `public` were backed up and dropped on 2026-10-20. **There is
no rollback to v1 any more**, and the comparison tooling (`drift`, `delta-v1`,
`verify-v1`, `check-v1`) was deleted with them. The rest of this file
is the record of the cutover.

- **Drift, run first:** nothing in v1 was missing from v2 except v1's 28
  exercise-template rows, which v2 no longer holds because its template was
  cleared on 2026-10-03 for refilling. Logged sets carry the exercise name, so
  no history depended on them. Of the 17 conflicting weigh-ins, 16 were the
  demo's (v2's value differs) and one was 2026-08-16, logged in both apps
  (identical); the one conflicting session was the demo's. `missing` was 1 on
  `body_weight`, that same 2026-08-16 row, so no real weigh-in hid behind the
  demo's negative `unaccounted`.
- **Backup:** `backups/v1-public-2026-10-20.json` (git-ignored, 4,299 rows), written
  by Postgres's own `json_agg` so dates stay `YYYY-MM-DD` strings, and checked
  against the live tables before the drop: every count, and sampled dates.
  `cofid_foods` 2,849 · `workout_sets` 993 · `exercises` 202 (every v1 account) ·
  `cardio_sessions` 84 · `workout_sessions` 69 · `body_weight` 59 ·
  `food_log_entries` 19 · `food_items` 16 · `habit_completions` 4 · `habits` 2 ·
  `nutrition_targets` 2 · and 0 in `chess_sessions`, `learning_log`, `media`,
  `media_seasons`, `portfolio_items`, `progress_photos`, `projects`,
  `workout_split`.

## Before

- [x] `npm run drift` shows `unaccounted: 0` on every table
- [x] `npm run delta-v1` reports 0 new rows, or the rows it inserted are accounted for
- [x] A workout logged end to end in v2 **on a phone**, not just a desktop browser
- [x] Reduced-motion pass done on the gym sheets

> **The gate is `unaccounted`, not `missing`.** `missing` counts v1 rows whose id
> is absent from v2, and one of those is permanent and correct: 2026-08-16's
> weigh-in was logged in both apps, so v2 holds it under its own id and the delta
> rightly skips v1's. `unaccounted = missing - conflicting` is the number that
> means "a v1 row is nowhere in v2". An earlier version of this checklist said
> `missing: 0`, which no run could ever have satisfied.

## The switch

1. **Stop logging in v1.** That is the whole of it — there is no deploy step,
   because v2 has been live throughout.
2. Bookmark the v2 URL and remove the v1 bookmark, so muscle memory does not
   quietly reintroduce drift.

## After (historical: v1 is gone)

- **v1 stays deployed and read-only** for at least a fortnight. It costs
  nothing and it is the rollback path.
- **Do not drop `public`** until v2 has been the daily driver for two weeks with
  no data problems. Dropping it is irreversible and buys only tidiness.

## Rollback (historical: no longer possible)

If something is badly wrong with v2:

1. Resume logging in v1 — it is untouched and current up to cutover.
2. Anything logged in v2 since cutover lives in `app` and can be copied back
   with the reverse of `deltaV1.ts`. **That script does not exist**, so budget
   about an hour to write it.
3. There is no time pressure: both schemas are in one database and neither
   expires.

## Known gaps at cutover

v2 does not have these, by decision — usage made them non-blocking:

| Feature | v1 rows | Status |
|---|---|---|
| Nutrition | 19 | Snapshot migrated; not reachable in v2 |
| Habits | 4 | Snapshot migrated; not reachable in v2 |
| Media | 0 | Never used |
| Progress photos | 0 | Never used |
| Insights, Onboarding, PWA | — | Never existed |

The nutrition and habit data is already in `app` and will surface when those
screens are built. Nothing needs re-migrating for them.
