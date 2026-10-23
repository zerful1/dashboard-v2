# dashboard-v2

A personal tracker — gym, body weight, nutrition, habits. A rebuild of a
single-user Supabase-client app into a multi-user client/server one.

npm workspaces: `shared/` and `server/` are CommonJS, `client/` is ESM and
bundled. React 19 · RSBuild 2 · Tailwind 4 · TanStack Query v5 · Express 4 ·
`pg` · Postgres 17 on Supabase.

**This file is for what reading the code will not tell you.** Anything derivable
from the source is deliberately absent.

## Always

- Dates are `YYYY-MM-DD` strings, never a JS `Date`.
- Every repository function takes `userId` first, and every query filters on it.
- No GET handler writes, ever. The public demo depends on it.
- Gate derived values on `isPending`, never `isLoading`.
- Never edit `.env` to reach production. Use the one-command override.
- Stage explicit paths, never `git add -A`: it has swept an unrelated file into
  a commit before.

---

## The design history is in another repository

Specs, plans and reviews are **not here**: they live in a separate, private
repository, and `CLAUDE.local.md` (gitignored) says where it is on this machine.
Searching only inside this repo makes every phase of work look unplanned, so
read the plan from there before starting anything, and tell any subagent where
it is. The plan is a proposal, not a record of what shipped; the two can drift.

---

## Dates are strings, end to end

`node-pg` parses a `date` column into a `Date` at **local midnight**, so during
BST `toISOString()` gives the previous day. Half a year's rows shift by one and
the other half do not, which looks like corruption rather than a bug. So every
query selects `date::text`, calendar arithmetic uses `shiftISO` (pure string
maths), and a charting library that demands `Date` objects is disqualified on
that alone.

**`toLocalISO()` is for the client, `todayISO(timeZone)` for the server.** A
deployed server is UTC for everyone, so server-side work must be handed the
user's `profiles.timezone`. `toLocalISO()` on the server is right in local
development and wrong in production, the worst way for it to be wrong.

**One clock per page.** A page that keeps `useToday()` hands that today to its
children rather than letting them call `toLocalISO()` again. `useToday` catches
up on focus or once a minute, so a second clock runs up to a minute ahead after
midnight, and one's today is the other's tomorrow.

---

## Ownership scoping replaces RLS

There is no row-level security. Every repository function takes `userId` first:

```ts
export async function listWeights(userId: string): Promise<BodyWeightEntry[]>
export async function deleteWeight(userId: string, id: string): Promise<boolean>
```

A scoped delete that matches nothing returns `false`, so the route answers 404
rather than 403: a foreign id is never confirmed to exist. **Every repository
gets an ownership test**, the only stand-in for the guarantee given up.
Client-side, query keys are scoped by user id for the same reason.

**A new user-owned table needs three more things:**

1. **The export** (`TABLES` in `server/src/repositories/export.ts`). It is the
   user's only backup, and `tests/export.test.ts` fails until every table with a
   `user_id` column is listed. Secrets are excluded by name, as
   `password_reset_tokens` is.
2. **`truncateAll`** in `server/tests/setup.ts`. Nothing fails if you forget;
   its rows just leak from one test into the next.
3. **A restore decision.** `tests/restore.test.ts` fails until every exported
   table is in `RESTORED_TABLES` (shared, in insert order, parents first) or
   `NOT_RESTORED` (`server/src/repositories/restore.ts`). A child table also
   needs its parent in `CHILD`, or its rows point at a parent the account may
   hold under another id.

**Old downloads must stay restorable**, so a column added to a restored table
must be nullable. The insert fills a key the file lacks with NULL, not the
column's default, so even `NOT NULL DEFAULT` fails every older file. **Preview
is the restore, rolled back**, so the two can't disagree; never count
separately.

---

## The demo is read-only because no GET writes

"Try the demo" signs anyone in as `demo@demo.invalid`, with no password.
`demoReadOnly`, at the front of the API, gives a demo session a 403 for
everything but `GET`, `HEAD`, `OPTIONS` and a short `ALLOWED` list: leaving the
demo, entering it again, and the auth endpoints that act for a caller who isn't
signed in.

So **no GET handler may write**, including writes the server makes on its own
account, such as a cache or a row created on first read. The GETs were audited
by hand once (PR #23) and no test re-checks them. `/api/export` reads inside a
`READ ONLY` transaction, so the database itself refuses a write there.

**A new auth endpoint that looks a user up by email treats the demo address as
unknown** (`isDemoEmail(email) ? null : …`, as login and forgot-password do).
The demo's password is random and unknown; a reset or magic link would give it
a real one.

What the demo code won't tell you:
- **Seven datasets.** Data is regenerated on entry once the newest weigh-in is
  older than yesterday. Windows starting on the same weekday draw the same
  random numbers, so a test that checks one "today" sees one of seven.
- **New demo data gets its own random stream**, as the habits do. A draw from
  the shared `rand` reshuffles every value after it. `demoGenerate.test.ts` pins
  one day's figures to catch that, but only once something is drawn after the
  new block.
- **Sessions last 6 hours idle**, not 30 days, because only entering refreshes
  the data.
- **The refresh's advisory lock key is shared** across `app`, `app_dev` and
  `app_test`, so a test run can delay a production entry by about a second.
- **It is not the only account in production.** Anything that counts rows
  without a user filter includes the demo and every other account.
- **Deleting it is harmless.** The next click recreates it.

---

## The database: two connection paths, three schemas

| | port | used by | why |
|---|---|---|---|
| `DATABASE_URL` | 6543, transaction pooler | runtime queries | no state survives between statements, so **every table reference is schema-qualified** via `T` in `server/src/config.ts`, never `SET search_path` |
| `MIGRATION_DATABASE_URL` | 5432, session pooler | migrations, scripts | one backend, so `SET search_path` persists and DDL stays unqualified |

**`app`** is production, **`app_dev`** local, **`app_test`** tests, all in one
database. `public` held the v1 app until its tables were dropped
(`docs/CUTOVER.md`); it now holds only Supabase's own objects (`rls_auto_enable`,
behind its `ensure_rls` event trigger). No migration may
name it: the test setup migrates `app_test` in this same database, so it would
touch the real one on the next test run.

**Both paths are TLS-verified in code, not by the URL.** node-pg connects in
plaintext unless handed `ssl`, and production once did, with nothing failing
to say so. `sslFor` (`server/src/db/ssl.ts`) gives a Supabase host Supabase's
own CA; a bare `sslmode=require` would refuse it, because pg treats it as
verify-full against Node's built-in CAs. Keep `sslmode` out of the URLs, since
the URL overrides the option, and give any new `Pool` `ssl: sslFor(url)`.

**Reaching production is a one-command override, never an edit:**

```bash
DB_SCHEMA=app npm run migrate
```

`dotenv` does not overwrite an existing process variable, so isolation returns
when the command ends. An edited `.env` is inherited by the next test run.

**A migration's shape decides its side of the deploy**, because merging
auto-deploys. An additive one runs on production **before** the merge: the old
code ignores a new column and the new code needs it. A dropping one runs
**after** the deploy is live: the old code still names the column. Check
`app._migrations` after either.

**Writing scripts refuse a schema by shape, before they write.** `seedDev.ts`
refuses any schema not ending in `_dev`; `tests/setup.ts` refuses anything but
`app_test` and a non-test `NODE_ENV`. A misconfigured environment then cannot
reach real data. New writing scripts get the same treatment.

**`importV1.ts` is a historical record, not live code.** It produced the
migrated data and cannot run again, since the tables it reads are gone. Leave
its private copies of `V1_USER` and `JUNK_SET_RULE` and its mentions of the
deleted `verifyV1`: an edit means it no longer matches what ran, and nothing
would say so.

---

## Workout history: `day_name` is snapshotted, `day_type` is reused

`workout_sessions` stores both, and **`day_type` is reused across split eras**:
in the migrated history `Upper A` and `Legs` are both `1`. So **every historical
view reads `day_name`** and never resolves `day_type` through the current split,
which would relabel history plausibly enough that nobody notices.

`workout_sets` has **no foreign key to `exercises`** by design: the template gets
pruned and the sets outlive it. Anything listing exercises for stats reads
`DISTINCT exercise_name` from `workout_sets`, not the template.

**"Last time" is per exercise, across day types** (`/api/workouts/last-times`).
Comparing against the last session of the same `day_type` reached into another
split era, and showed nothing when that session skipped the exercise.

**Stats trends look back 32 weeks** (`liftProgress` in shared): the last 6
against the 26 before. Against all-time bests, a lift rebuilt after a layoff
would read "Going back" for months while it climbed.

---

## TanStack Query

**A disabled query reports `isLoading: false`.** In v5 `isLoading` is
`isPending && isFetching`, so a query waiting on `enabled: !!user` is idle with
no data, not loading. A component rendering a *derived value* gates on
`isPending`, or it paints conclusions from an empty array and then corrects
itself.

This bites hardest in **`useSplit()`, which returns `data ?? DEFAULT_SPLIT`**: an
unloaded split shows a real, wrong day name (`day_type 3` is Legs on a real
account and Push in the default). So `useSplit` exposes `isPending` and
deliberately not `isLoading`, and `failed` for a split that failed with nothing
cached: Gym and Home show it, and Gym decides no day while it stands. Home's
top slot (`useHomeDay`) waits for every source it reads, for the same reason.

**Offline:**
- A query keyed by today is a new key every day, so offline on a new day it
  has nothing cached and pauses.
- `onlineManager` changes only on `online`/`offline` events, so
  `createQueryClient` starts it offline when `navigator.onLine` is false.
- A device online with no internet still fetches. `api()` gives up after 15 s
  (`API_TIMEOUT_MS`) as `ApiError(0, "Timed out", "timeout")`, and only the
  wait for the answer to *start* is timed: `/api/export` streams the user's
  only backup, and timing the body would cut it off on a slow connection. A
  timed-out query is not retried; other failures are retried once.

**`placeholderData` covers only the pending case:**
- Stats and History's grid show yesterday's answer from `newestCached`, scoped
  by the user id in the key prefix.
- Food's 7-day strip borrows **yesterday's exact window**, never the newest: it
  reads a missing date as "nothing logged", so any other window invents empty
  days. It stands in for a failed fetch too (`useFoodDays`).
- Home's diary and workout are keyed by today, and yesterday's answer is wrong
  there, so Home waits behind its spinner: a known gap.

**Query options are shared, not re-declared.** `goalsQueryOptions`,
`exercisesQueryOptions` and `workoutDayQueryOptions` are the one definition of
their query; a second reader spreads them and overrides only `enabled`. Two
declarations of one key is how a cache entry ends up with two shapes.

**Two version constants**, neither discoverable from the code that depends on
them, and independent of each other:
- **`buster`** in `client/src/App.tsx`: bump on **any change to a cached query's
  shape**, or the previous deploy's restored cache reaches components expecting
  the new one and fails far from the cause.
- **`CACHE`** in `client/public/sw.js`: bump to expire every cached asset.

`gcTime` must stay `>=` the persister's `maxAge`, or queries are collected from
memory before their persisted copy expires and the restored cache comes back
empty.

---

## Offline: the service worker never caches `/api`, and writes never queue

The `/api` early-return is the **first path rule** in `sw.js`'s fetch handler:
after the "not a GET" and "another origin" returns, before anything that
responds. A test asserts that ordering against the source, because the hazard
is a catch-all added above it. `/api` is same-origin here, so caching it would
store one user's data where it outlives sign-out and the next person to open
the browser can read it.

Offline reads come from the persisted query cache instead, purged at every
identity change in `AuthProvider` (sign-in, registration, entering the demo,
sign-out). `qc.clear()` empties memory only, so `persister.removeClient()`
accompanies every one.

**Writes are not queued offline, in any feature.** They fail with a toast and
are logged again once back online, and a banner says so, because a silent
failure looks like success. The rule is `networkMode: "always"` in
`defaultOptions.mutations` (`client/src/lib/queryClient.ts`): TanStack's default
pauses a write and replays it on reconnect, so it looks saved and is lost if the
app closes first. No hook should set its own `networkMode`. Tests use
`createQueryClient()`, since a bare `new QueryClient()` lacks the rule. The
toast says **"You're offline — not saved"** (`writeFailureMessage`), matching
the banner, or **"Timed out — may not have saved"**, since a slow write can
still land.

---

## Design system

**White is the only accent, with four roles.** A filled white **pill**
(`bg-accent text-bg`: the `primary` Button, or `buttonClass("primary")` on a
link) is *the one action to take*, at most one per screen. **Tinted**
(`bg-accent/10 text-accent`) is *the selected item in a set*, a state, never an
action. A small filled white **circle** (24 px or less: a set tick, a habit
tick, a week dot) is a *done mark*. And **identity chrome**: the wordmark, the
page eyebrow, the active tab. White as data ink, such as a chart's line, is the
data, not a role. `tests/accentRule.test.ts` lists every file allowed a solid
white fill (`bg-accent`, `bg-text`, `bg-white`) with its reason; adding one is a
decision.

**`dim` is decoration, never words.** `dim` (#555) is 2.8:1 on black:
chevrons, placeholders, disabled text, an empty "—". Anything a person reads is
`muted` (6.1:1) or brighter. `tests/dimText.test.ts` counts every `text-dim`.

**Each signal colour has one job.** `good` (green): toward your goal, or
progress advice. `caution` (amber): over a target, or a warning. `negative`
(red): an error or a destructive action. A weight trend is only ever `good` or
white (`trendTone`): whether a weight is bad depends on the phase.

**One weight rate.** Weight's rate line, Home's weight line and Insights' goal
projection all come from `trendFit` in shared: least squares over the last 56
days, at least 14 weigh-ins, "flat" under 0.05 kg a week. The composition line
reads the same fit and takes its colour from `rateTone`, so a moving weight
can't read green beside a white rate; a steady weight reads green only for its
lifts. Agreement was chosen over a faster smoothed rate, so changing the method
in one place makes screens contradict each other. The big figure above is the
7-day average on purpose.

**No boxes.** Grouping is `Card` (content under a hairline) or `List` (rows
between hairlines). `rounded-card` is for media only (the barcode camera).

**`figure` for big numbers, `lbl` for labels.** `figure` is light and tabular;
`lbl` is 11 px grey sentence case. Neither uppercases, so write labels the way
they should read. **`raised` is borders and gridlines only**, never data.

---

## Client gotchas

**Optimistic mutations:** `onMutate` snapshots and writes, `onError` rolls back
*only*, `onSettled` invalidates. The global handler owns the message, so one
failure gives one message. It lives on the **`MutationCache`** in
`client/src/lib/queryClient.ts` and must stay there: TanStack spreads a hook's
options over `defaultOptions.mutations`, so a handler there is replaced by every
hook's rollback `onError`. (A plain option such as `networkMode` is safe there.)

**A query or mutation whose screen shows its own failure** opts out of the toast
with `meta: { errorToast: false }`; otherwise the failure goes unreported. A
query shows its error card only when it has no data: a failed refetch keeps the
last good data, so `isError` alone doesn't mean nothing to show.

**Only `client/src/features/weight/WeightChart.tsx` imports a charting
library**, "THE swappable boundary". A new chart is a new export from it, never
a second import site.

**Inter is bundled** (`@fontsource-variable/inter`). Never load a font from a
CDN: the app must draw offline, and a font host is a third-party request on
every first visit. `tests/fonts.test.ts` fails on any remote font source.

**Nothing may reach past the screen's edge, fixed elements included.** iOS pans
the whole page sideways for it; Chromium doesn't, so no desktop check sees it.
`styles.css` overrides sonner's phone toaster for this. Double-tap zoom is off
(`touch-action: manipulation` at `:where()` specificity), since a zoomed page
pans too; pinch zoom stays, so never lock the viewport.
`tests/viewportFit.test.ts` pins both.

**Breakpoint pairs must be exact complements**: `lg:hidden` against `lg:flex`
(the rail takes over at 1024 px). A mismatch opens a band of widths with no
navigation, and jsdom never evaluates media queries, so no test catches it.

**A shared link's card names the production domain.** `og:image` and `og:url`
in `src/index.html` must be absolute, so they spell out
`dashboard-v2-nine-phi.vercel.app`. A new domain means editing both, or the card
silently loses its picture. `public/og.png` is rendered from
`scripts/og-image.html` (the command is in its comment) at 1200 × 630
(`linkPreview.test`). Redraw it there, not by hand.

**The barcode decoder is served by this app.** Without a native
`BarcodeDetector` (every iPhone), `barcodeDetector.ts` loads the
`barcode-detector` ponyfill, whose `locateFile` points at
`/static/wasm/zxing_reader-<version>.wasm`; `rsbuild.config.ts` copies that file
into the build (`output.copy`) under zxing-wasm's own version. Remove the copy
and Vercel answers the URL with `index.html` and a 200, `sw.js` caches that
HTML, and scanning breaks on every iPhone until `CACHE` is bumped. Remove
`locateFile` and the ponyfill fetches from jsDelivr at scan time. A future
Content Security Policy must allow `'wasm-unsafe-eval'`.

---

## Testing

**Mock `api` by path, never by call order.** Pages fire requests with no
serialisation, so `mockResolvedValueOnce` chains pass or fail by timing. Order a
`startsWith` route table **longest-prefix-first**, or
`/api/workouts/session-detail` is swallowed by `/api/workouts/session`.

**A test that passes before the fix is not testing the fix.** Break the fix and
confirm the test fails. Several here first passed for unrelated reasons.

**Negative assertions need a positive complement.** "Does not cache `/api`" is
satisfied by a handler that does nothing, so it sits beside "does serve hashed
build output".

**CI runs on Linux; the suites were written on Windows.** Every PR and push to
`main` runs typecheck, build and all three suites, the server's against a
throwaway Postgres 17 (`.github/workflows/ci.yml`). supertest starts and closes a
server per request, and several fired at once reset a connection now and then
on Linux, so send a test's requests one at a time unless concurrency is the
point.

Tests run against `app_test`, and the suite refuses to start against anything
else.

---

## Local development

```bash
npm run dev:api      # Express on :3001
npm run dev:web      # RSBuild on :5173, proxying /api to :3001
```

The proxy gives the browser **one origin**. Without it the session cookie is
cross-site and dropped, and nothing authenticated works locally.

**Sign-ups are closed unless `SIGNUP_ALLOWLIST` says otherwise.** Unset means
nobody new can register, and production relies on that: holding other people's
health data brings legal duties this app is not set up for. To register locally,
set `SIGNUP_ALLOWLIST=*` in `.env` or in front of `npm run dev:api`. The test
suite sets `*` (`server/vitest.config.mts`), so **a test never proves something
works with sign-ups closed** unless it builds the app with
`createApp({ signups: parseSignupPolicy(undefined) })`, as the demo entry's test
does. Registering the demo address is always refused.

`npm run dev:web:lan` adds `--host` for a real device. It **puts the app and its
`app_dev` data on the local network**: fine at home, not on shared wifi. It
can't test the barcode scanner, since `http://<lan-ip>` is not a secure context;
test scanning on the deployed site.

`npm run seed-dev -w @dashboard/server -- --email <address> --reset` populates
an existing `app_dev` account (register it in the local app first); without it,
every gym screen is blank. "Try the demo" also works locally with no setup, but
can't save anything.
