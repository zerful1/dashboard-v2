# dashboard-v2

A personal tracker — gym, body weight, nutrition, habits, media. A rebuild of a
single-user Supabase-client app into a multi-user client/server one.

npm workspaces: `shared/` and `server/` are CommonJS, `client/` is ESM and
bundled. React 19 · RSBuild 2 · Tailwind 4 · TanStack Query v5 · Express 4 ·
`pg` · Postgres 17 on Supabase.

**This file is for what reading the code will not tell you.** Anything derivable
from the source is deliberately absent.

---

## The design history is in another repository

Specs, plans and reviews for this project are **not here**. They are in the
sibling v1 repo:

```
C:\Users\zerful\Desktop\daboards\dashboard-v1    branch: docs/dashboard-v2-design
                                                 path:   docs/superpowers/
                                                 repo:   github.com/zerful1/dashboard
```

That path is this machine’s; the repo is private but cloneable, so on any other
machine it is wherever you put it. That branch is **currently local-only** — on
no remote as of 2026-08-31. Searching only inside `dashboard-v2` finds no spec
and makes nine phases of work look unplanned. Read
the plan from there before starting anything, and tell any subagent where it is
and that looking in this repo will not find it.

The two can drift. The plan is a proposal, not a record of what shipped.

---

## Dates are strings, end to end

Every date is a `YYYY-MM-DD` string from the database to the DOM. Never a JS
`Date`.

`node-pg` parses a `date` column into a `Date` at **local midnight**, so during
BST `toISOString()` gives the previous day. Half a year's rows shift by one and
the other half do not, which looks like corruption rather than a bug. So:

- every query selects `date::text`
- calendar arithmetic uses `shiftISO`, which is pure string maths
- a charting library that demands `Date` objects is disqualified on those
  grounds alone — that is what ruled one out in phase 4

**`toLocalISO()` is for the client. `todayISO(timeZone)` is for the server.**
The browser already runs in the user's timezone; a deployed server is UTC for
everyone regardless of where they are, so server-initiated work must be handed
the user's `profiles.timezone` explicitly. Using `toLocalISO()` on the server is
correct in local development and wrong in production, which is the worst way for
it to be wrong.

---

## Ownership scoping replaces RLS

There is no row-level security. **Every repository function takes `userId`
first** and every query filters on it:

```ts
export async function listWeights(userId: string): Promise<BodyWeightEntry[]>
export async function deleteWeight(userId: string, id: string): Promise<boolean>
```

A scoped delete that matches nothing returns `false`, which is what lets the
route answer 404 rather than 403 — a foreign id should not be confirmed to
exist.

**Every repository gets an ownership test.** That is the only thing standing in
for the database-level guarantee that was given up.

Client-side, query keys are scoped by user id for the same reason.

---

## Two connection paths, three schemas

| | port | used by | why |
|---|---|---|---|
| `DATABASE_URL` | 6543, transaction pooler | all runtime queries | no connection state survives between statements, so **every table reference is schema-qualified** via `T` in `server/src/config.ts` — never `SET search_path` |
| `MIGRATION_DATABASE_URL` | 5432, session pooler | migrations, one-off scripts | holds one backend, so `SET search_path` persists and DDL can stay unqualified |

Schemas in one database: **`app`** is production, **`app_dev`** local,
**`app_test`** tests. `public` is the retired v1 app, kept read-only as the
rollback path.

### Reaching production is a one-command override, never an edit

```bash
DB_SCHEMA=app npm run drift
```

`dotenv` does not overwrite an existing process variable, so isolation returns
the moment the command ends. **Never edit `.env` to point at `app`** — the next
test run inherits it.

### The `_dev` suffix guard is a convention, not three separate guards

Anything that writes refuses a schema it should not touch, **before it writes**,
by shape rather than by a list:

- `seedDev.ts` refuses any schema not ending in `_dev`
- `tests/setup.ts` refuses anything but `app_test`, and refuses a non-test
  `NODE_ENV`

The point is that a misconfigured environment cannot reach real data, rather
than that someone remembered not to. New writing scripts get the same treatment.

---

## `importV1.ts` is a historical record, not live code

It produced the migrated data on 2026-08-15 and will not run again. It keeps
**private copies of `V1_USER` and `JUNK_SET_RULE` on purpose.**

`v1Source.ts` is the shared source for everything else — `verifyV1`, `deltaV1`,
`driftReport` — and a duplicate-constant sweep will find the restated copies in
`importV1.ts` and want to consolidate them. Doing that would mean the file no
longer matches what actually ran, and **nothing would fail to tell you.** It is
a landmine triggered by good instinct, which is the only reason it is written
down here.

---

## `day_name` is snapshotted, and `day_type` is reused

`workout_sessions` stores both. **`day_type` is reused across split eras** — in
the migrated history `Upper A` and `Legs` are both `day_type 1`, and `Upper B`
and `Pull` are both `2`. Only `day_name` distinguishes them.

So **every historical view reads `day_name` directly** and never resolves
`day_type` through the current split. Resolving it relabels history whenever the
split is edited, and does so plausibly enough that nobody notices.

`workout_sets` has **no foreign key to `exercises`** by design: exercises get
pruned from the template, and the sets outlive them. The template holds 28 rows
spanning 20 distinct names; the history spans 66. Anything listing exercises for
*stats* must read `DISTINCT exercise_name` from `workout_sets`, not the
template.

---

## TanStack Query: `isPending`, not `isLoading`

**A disabled query reports `isLoading: false`.** In v5 `isLoading` is
`isPending && isFetching`, so a query waiting on `enabled: !!user` is not
"loading" — it is idle with no data.

Any component that renders a *derived value* must gate on `isPending`, or it
will paint conclusions drawn from an empty array and then correct itself.

This has teeth because **`useSplit()` returns `data ?? DEFAULT_SPLIT`**. An
unloaded split is indistinguishable from a default one, so a page that renders
before it arrives does not fall back to something obviously blank — it shows a
real, wrong day name. Measured on a real account: its Monday is `day_type 3` =
**Legs**, while `DEFAULT_SPLIT`'s Monday is `day_type 3` = **Push**. Same
number, different label.

`useSplit` therefore exposes `isPending` and deliberately does **not** expose
`isLoading`.

---

## Two version constants, moved for different reasons

Neither is discoverable from the code that depends on them.

**`buster` in `client/src/App.tsx`** — bump on **any change to a cached query's
shape**. Without it, a restored cache from the previous deploy is handed to
components expecting the new shape, and fails far from the cause.

**`CACHE` in `client/public/sw.js`** — bump to expire every cached asset at
once.

They are independent and do not have to move together.

Related invariant: `gcTime` must stay `>=` the persister's `maxAge`. Below it, a
query is garbage collected from memory before its persisted copy expires and the
restored cache silently comes back empty.

---

## The service worker must never cache `/api`

The `/api` early-return is the **first path rule** in the fetch handler — after
the "not a GET" and "another origin" returns, and before anything that responds.
A test asserts that ordering against the source, because the hazard is a
catch-all added *above* it, which no behavioural test can exercise.

The v1 app could use a "cache same-origin GETs" rule safely because its API was
on another host. Here `/api` is same-origin, so that rule would write one user's
authenticated JSON into a store that outlives sign-out and is readable by the
next person to open the browser.

Offline reads come from the persisted query cache instead, which is per-user and
purged at all three identity transitions in `AuthProvider`. `qc.clear()` empties
memory only — the persisted copy is a separate artifact, so `persister.removeClient()`
has to accompany every one of them.

**Writes are not queued offline.** Logging with no signal fails with a toast. A
banner says so, because failing silently would look like success.

---

## Frontend conventions

**The accent colour marks exactly three roles.** Filled (`bg-accent text-bg`) is
*the one action to take* — at most one per screen. Tinted (`bg-accent/10
text-accent`) is *the currently selected item in a set* — a state, never an
action. The `lbl` micro-label carries it for identity chrome (wordmark, page
eyebrow, active nav item), which is outside the rule. Anything else wanting to
be terracotta is one of those three or it is not terracotta.

**`raised` is borders and gridlines only.** Never data.

**`client/src/features/weight/WeightChart.tsx` is the only file allowed to
import a charting library.** It says so at the top. A second import site retires
the rule silently — if a chart is needed elsewhere, it is a new export from that
file, not a new import.

**Breakpoint conditions must be exact complements.** `xl:hidden` against
`xl:flex`, same threshold. A mismatched pair does not fail loudly; it opens a
band of viewport widths with no navigation at all, and jsdom never evaluates
media queries so no test will catch it.

**Optimistic mutations**: `onMutate` snapshots and writes, `onError` rolls back
*only*, `onSettled` invalidates. The global handler in `App.tsx` owns the
message — per-hook handlers never touch UI, so one failure produces one message.

---

## Testing

**Mock `api` by path, never by call order.** Pages fire several requests with no
serialisation between them, so `mockResolvedValueOnce` chains are a race that
passes or fails by timing. Order the route table **longest-prefix-first** when
matching with `startsWith`, or `/api/workouts/session-detail` is swallowed by
`/api/workouts/session`.

**A test that passes before the fix is not testing the fix.** When adding a
regression test, break the fix and confirm the test fails. Several here passed
for unrelated reasons on the first attempt.

**Negative assertions need a positive complement.** "Does not cache `/api`" is
satisfied by a handler that does nothing at all, so it sits beside "does serve
hashed build output".

Tests run against `app_test` and the suite refuses to start against anything
else.

---

## Local development

```bash
npm run dev:api      # Express on :3001
npm run dev:web      # RSBuild on :5173, proxying /api to :3001
```

The proxy exists so the browser sees **one origin**. Without it the session
cookie is cross-site and is dropped, and nothing authenticated works locally
however correct the server is.

`npm run dev:web:lan` adds `--host` for testing on a real device. It binds to
`0.0.0.0`, and because `/api` is proxied through that same process, **it puts
the app and its `app_dev` data on the local network.** Fine at home, not fine on
shared wifi. It is a separate script rather than the default for that reason.

`npm run seed-dev -w @dashboard/server -- --email <address> --reset` populates
an account in `app_dev`, which otherwise renders every gym screen blank. It
never creates users: register an account in the local app first, then seed it
by that address.

---

## Commits

No `Co-Authored-By` trailers. Stage explicit paths rather than `git add -A` —
that has swept an unrelated file into a commit before.
