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
no remote as of 2026-10-04. Searching only inside `dashboard-v2` finds no spec
and makes every phase of work look unplanned. Read
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

**A new user-owned table also goes in the export** (`TABLES` in
`server/src/repositories/export.ts`). The export is the user's only backup, so
`tests/export.test.ts` reads every table with a `user_id` column from the database
and fails until the new one is listed. Secrets are excluded by name there, the way
`password_reset_tokens` is. Add the new table to `truncateAll` in
`server/tests/setup.ts` too. Nothing fails if you forget, but its rows then leak
from one test into the next.

---

## The demo is read-only because no GET writes

"Try the demo" signs anyone in as `demo@demo.invalid`, with no password. One
middleware, `demoReadOnly`, keeps it read-only. It runs at the front of the API
and gives a demo session a 403 for everything except `GET`, `HEAD` and
`OPTIONS`, plus a short list in `ALLOWED`: leaving the demo, entering it again,
and the auth endpoints that act for a caller who isn't signed in (login,
register, forgot and reset password).

So **no GET handler may write, anywhere, ever.** A GET that writes is open to
every visitor of a public demo. The 27 that existed were audited by hand for
PR #23. `/api/export` came later and reads inside a `READ ONLY` transaction, so
the database itself refuses a write there. No test re-checks the others. Writes the server makes on its own account count too, such
as a cache or a row created on first read.

**A new auth endpoint that looks a user up by email must treat the demo address
as unknown**: `isDemoEmail(email) ? null : …`, as login and forgot-password do.
The demo has a random password nobody knows, and a reset or a magic link would
hand it a real one.

What the demo code won't tell you:
- **Seven datasets.** Its data is regenerated on entry once the newest weigh-in
  is older than yesterday. Windows that start on the same weekday draw the same
  random numbers, so there are exactly seven demo datasets, one per weekday. A
  test that checks only one "today" sees one of the seven.
- **New demo data gets its own random stream.** The habits use their own seed
  for this reason. A draw from the shared `rand` reshuffles every value after it,
  and `demoGenerate.test.ts` pins one day's figures (sessions, sets, weigh-ins,
  food, goals) to catch exactly that. A block that draws last shifts nothing yet,
  so that test only catches it once something is drawn after it.
- **Short sessions.** A demo session lasts 6 hours idle instead of 30 days,
  because only entering the demo refreshes its data.
- **A shared lock.** The refresh's advisory lock key is one constant across
  `app`, `app_dev` and `app_test`, which share a database. A test run can delay
  a production entry by about a second.
- **Two accounts in production.** Anything that counts or compares rows without
  a user filter now includes the demo. `driftReport` does this; see below.
- **Deleting it is harmless.** The next click recreates the account.

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

**`driftReport` scopes the v1 side to the owner but counts every v2 row.** That
was right while production had one account. Since the demo, the demo's
weigh-ins and sessions appear as CONFLICTING on any date v1 also has, and
"unaccounted" can go negative. It is misleading, not damage: the delta is
`ON CONFLICT DO NOTHING`. The overlap ends around 2026-12-06, when the demo's
16-week window moves past v1's last dates. Excluding the demo user's rows is the
fix if drift is needed before then.

---

## `day_name` is snapshotted, and `day_type` is reused

`workout_sessions` stores both. **`day_type` is reused across split eras** — in
the migrated history `Upper A` and `Legs` are both `day_type 1`, and `Upper B`
and `Pull` are both `2`. Only `day_name` distinguishes them.

So **every historical view reads `day_name` directly** and never resolves
`day_type` through the current split. Resolving it relabels history whenever the
split is edited, and does so plausibly enough that nobody notices.

`workout_sets` has **no foreign key to `exercises`** by design: exercises get
pruned from the template, and the sets outlive them. On 2026-10-04 production's
template was empty (cleared on 2026-10-03 for the user to refill), while the
history spanned 84 distinct names. Anything listing exercises for *stats* must
read `DISTINCT exercise_name` from `workout_sets`, not the template.

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
purged at every identity transition in `AuthProvider`: sign-in, registration,
entering the demo and sign-out. `qc.clear()` empties memory only — the persisted
copy is a separate artifact, so `persister.removeClient()` has to accompany
every one of them.

**Writes are not queued offline, in any feature.** Logging with no signal fails
with a toast and is logged again once back online — the user's call, made for
Gym on 2026-10-03. A banner says so, because failing silently would look like
success. The rule is `networkMode: "always"` in `defaultOptions.mutations`
(`client/src/lib/queryClient.ts`); TanStack's own default pauses a write
offline and replays it on reconnect, so it looks saved and is lost if the app
closes first. A hook inherits the rule unless it sets its own `networkMode`,
and none should. Its tests use `createQueryClient()`, because a bare
`new QueryClient()` in a test does not have it. The global toast then says
**"You're offline — not saved"** (`writeFailureMessage`, same file), so it agrees
with the banner rather than reading as some other fault.

---

## Frontend conventions

**The accent colour marks exactly three roles.** Filled (`bg-accent text-bg`) is
*the one action to take* — at most one per screen. Tinted (`bg-accent/10
text-accent`) is *the currently selected item in a set* — a state, never an
action. The `lbl` micro-label carries it for identity chrome (wordmark, page
eyebrow, active nav item), which is outside the rule. Anything else wanting to
be terracotta is one of those three or it is not terracotta.

**`raised` is borders and gridlines only.** Never data.

**Only `client/src/features/weight/WeightChart.tsx` was meant to import a
charting library.** Its component comment calls it "THE swappable boundary".
The rule broke silently, exactly as it warns: `client/src/features/gym/ProgressionChart.tsx`
imports Recharts too. It was added on 2026-08-17, before the rule was written
down on 2026-08-31, and nobody noticed until 2026-10-04. Treat those two files
as the only import sites, and allow no third. A new chart is a new export from
`WeightChart.tsx`. Moving `ProgressionChart` behind it would make the rule true
again.

**Breakpoint conditions must be exact complements.** `xl:hidden` against
`xl:flex`, same threshold. A mismatched pair does not fail loudly; it opens a
band of viewport widths with no navigation at all, and jsdom never evaluates
media queries so no test will catch it.

**Optimistic mutations**: `onMutate` snapshots and writes, `onError` rolls back
*only*, `onSettled` invalidates. The global handler owns the message — per-hook
handlers never touch UI, so one failure produces one message. It lives on the
**`MutationCache`** in `client/src/lib/queryClient.ts`, and must stay there:
TanStack merges a hook's options over `defaultOptions.mutations` with a plain
spread, so a handler there is replaced by every hook's own rollback `onError`,
and failures go unreported. (A plain option such as `networkMode` *is* safe in
`defaultOptions.mutations`: the spread only loses what a hook also sets.)

**A query whose page renders its own failure opts out of the toast** with
`meta: { errorToast: false }`, and shows its error card only when there is no
data. A failed refetch keeps the last good data, so `isError` alone does not
mean there is nothing to show.

**A mutation whose screen shows its own failure** opts out the same way, with
`meta: { errorToast: false }` on the mutation, which the `MutationCache` checks
(`mutation.options.meta`). The Targets sheet's body details were the first. Use
it only where an inline error replaces the toast, otherwise the failure goes
unreported.

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

**Sign-ups are closed unless `SIGNUP_ALLOWLIST` says otherwise.** Unset means
nobody new can register, and production relies on that: holding other people's
health data brings legal duties this app is not set up for. To register locally,
set `SIGNUP_ALLOWLIST=*` in `.env`, or put it in front of `npm run dev:api` for
one run. The test suite sets `*` in `server/vitest.config.mts`, so **a test
never proves something works with sign-ups closed** unless it builds the app with
`createApp({ signups: parseSignupPolicy(undefined) })`. The demo entry has a test
like that, because it must ignore the allowlist. Registering the demo address is
always refused.

`npm run dev:web:lan` adds `--host` for testing on a real device. It binds to
`0.0.0.0`, and because `/api` is proxied through that same process, **it puts
the app and its `app_dev` data on the local network.** Fine at home, not fine on
shared wifi. It is a separate script rather than the default for that reason.

`npm run seed-dev -w @dashboard/server -- --email <address> --reset` populates
an account in `app_dev`, which otherwise renders every gym screen blank. It
never creates users: register an account in the local app first, then seed it
by that address. For a populated account with no setup at all, "Try the demo"
works locally too: it needs no allowlist and fills `app_dev`'s demo account by
itself. It can't save anything, though.

---

## Commits

No `Co-Authored-By` trailers, and no "Generated with Claude Code" line in
commits or PR descriptions. Stage explicit paths rather than `git add -A` —
that has swept an unrelated file into a commit before.
