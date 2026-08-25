# Cutover: v1 → v2

**Cut over on:** 2026-08-25

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

## After

- **v1 stays deployed and read-only** for at least a fortnight. It costs
  nothing and it is the rollback path.
- **Do not drop `public`** until v2 has been the daily driver for two weeks with
  no data problems. Dropping it is irreversible and buys only tidiness.

## Rollback

If something is badly wrong with v2:

1. Resume logging in v1 — it is untouched and current up to cutover.
2. Anything logged in v2 since cutover lives in `app` and can be copied back
   with the reverse of `deltaV1.ts`. **That script does not exist**, so budget
   about an hour to write it.
3. There is no time pressure: both schemas are in one database and neither
   expires.

## Running the tooling after cutover

All three read production through a one-command override. **Never edit `.env`** —
`dotenv` does not overwrite an existing process variable, so isolation returns on
its own when the command ends.

```bash
DB_SCHEMA=app npm run drift                                    # read-only
DB_SCHEMA=app npm run delta-v1 -- --email <you> --dry-run      # rolled back
DB_SCHEMA=app npm run verify-v1 -- --email <you>               # read-only
```

`delta-v1` is idempotent — every statement ends in a bare `ON CONFLICT DO
NOTHING` with **no conflict target**, so it skips on a primary-key collision and
on a natural-key collision alike. Naming a constraint would abort the whole
transaction on the other, and both kinds have occurred. Do not "make it more
explicit" by adding a target.

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
