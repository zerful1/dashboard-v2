# Dashboard v2 — handoff summary

For a reviewer with no prior context. Covers where everything lives, what is built
and verified, which of your earlier findings landed, and what is worth looking at now.

**Every claim below cites the file that backs it.** Paths are relative to the repo
they live in — either `dashboard-v2/` (code) or `dashboard/` (documents). The two are
separate repositories; see §2.

---

## 1. What this is

A single-user React + Supabase-client personal tracker (gym, nutrition, habits,
media) being rebuilt as a **multi-user client/server app** with its own
session-based authentication. Partly a real tool for 2–3 known users, partly a
portfolio piece to demonstrate backend work.

## 2. Where things are

| | Path |
|---|---|
| **v2 code** | `C:\Users\zerful\Desktop\dashboard-v2` — GitHub `zerful1/dashboard-v2`, private |
| **v1 app (still running)** | `C:\Users\zerful\Desktop\dashboard` |
| **Specs, plans, reviews** | In the **v1** repo, branch `docs/dashboard-v2-design`, under `docs/superpowers/` |
| **Deployed** | https://dashboard-v2-nine-phi.vercel.app — API only so far |

The planning documents were never moved into the new repo. Looking only inside
`dashboard-v2` finds no spec.

**Read in this order** (all in the `dashboard` repo, branch `docs/dashboard-v2-design`):

| Order | File | What it is |
|---|---|---|
| 1 | `docs/superpowers/specs/2026-08-05-dashboard-rebuild-design.md` | The design. §6 auth, §6.3 the RLS replacement, §7 data, §9 client |
| 2 | `docs/superpowers/plans/2026-08-06-foundation-and-auth.md` | Phase 1, complete. 15 tasks |
| 3 | `docs/superpowers/plans/2026-08-09-client-and-auth-screens.md` | Phase 2, in progress. Read the "Versions — corrected during execution" section first |
| 4 | `docs/superpowers/reviews/2026-08-06-review-round-2-request.md` | What was asked of the previous review |
| 5 | `docs/superpowers/reviews/2026-08-06-review-round-2-reply.md` | What was done with the answers |

## 3. Stack

`shared` and `server` are CommonJS TypeScript; `client` is ESM, bundled.

| Workspace | Contents | Config |
|---|---|---|
| `shared/` | Pure domain logic and types, ported from v1, imported by both halves | `shared/tsconfig.json`, `shared/vitest.config.mts` |
| `server/` | Express 4, `express-session` + `connect-pg-simple`, `pg`, `zod`, argon2id | `server/tsconfig.json`, `server/vitest.config.mts` |
| `client/` | React 19, RSBuild 2, Tailwind 4, React Router 7, TanStack Query v5 | `client/rsbuild.config.ts`, `client/tsconfig.json` |

Shared compiler options: `tsconfig.base.json`. Vercel entry point: `api/index.ts`,
typechecked via the root `tsconfig.json`. Deployment config: `vercel.json`.

TypeScript 6 across all three; Postgres 17 on Supabase; Vercel Hobby.

## 4. Status

**Phase 1 (foundation + auth API): complete, deployed, verified in production.**

15 tasks. **203 tests** — 147 in `shared/tests/`, 56 in `server/tests/`. Typecheck
clean across all workspaces plus `api/`.

| Surface | Route file | Tests |
|---|---|---|
| Register, login, logout, `/me`, change password, forgot, reset | `server/src/routes/auth.ts` | `server/tests/auth.test.ts`, `server/tests/passwordReset.test.ts` |
| Profile read/update, account deletion | `server/src/routes/profile.ts` | `server/tests/profile.test.ts` |
| Health, keepalive cron | `server/src/app.ts` | `server/tests/health.test.ts` |

Verified against the live deployment: landing page, health, DB reachable from the
function, register → `/me` on a *separate invocation* (proving sessions round-trip
through Postgres, not memory), profile read/patch, 401s on unauthenticated and wrong
password, vague 400 on duplicate register, field-level validation errors, delete →
401. Test account cleaned up; v1's 19 `public` tables untouched throughout.

**Phase 2 (client): 2 of 11 tasks done.** Workspace scaffolded
(`client/rsbuild.config.ts`), design tokens in (`client/src/styles.css`). Tasks 3–11
remaining: `api()` wrapper, `AuthProvider`, UI primitives, router, login/register/
reset screens, responsive shell, settings, deploy.

## 5. Key architectural decisions

| Decision | Where it lives |
|---|---|
| **Sessions, not JWT.** httpOnly cookie, Postgres-backed store, `rolling`, `saveUninitialized: false` | `server/src/middleware/session.ts`; table DDL in `server/src/db/migrations/001_auth.sql` |
| **Ownership replaces RLS structurally.** Every repository function takes `userId` first and scopes its `WHERE` by it | `server/src/repositories/users.ts`, `profiles.ts`, `passwordResets.ts` |
| `req.userId` assigned in exactly one place, read only from the session | `server/src/middleware/requireAuth.ts`; type augmentation in `server/src/types/express.d.ts` |
| `requireAuth` mounted at router level so new routes are protected by default | `server/src/routes/profile.ts` (line ~13) |
| **Ownership tests** — the actual enforcement, since the convention is not compiler-checked | `server/tests/profile.test.ts`, `describe("ownership scoping")` |
| **Two connection paths.** Runtime uses the transaction pooler (6543) where connection state does not persist, so all runtime SQL is schema-qualified via the `T` map | `server/src/config.ts` (the `T` export), `server/src/db/pool.ts` |
| Migrations use the session pooler (5432) where `SET search_path` persists, so DDL stays unqualified and one `.sql` serves both `app` and `app_test` | `server/src/db/migrate.ts`, `server/src/db/migrations/001_auth.sql` |
| Test harness refuses to run outside `app_test` | `server/tests/setup.ts` (top of file) |
| **Same Supabase project, new `app` schema** so photos stay put and v1 keeps running | spec §7.1; `.env.example` documents both connection strings |
| **A calendar day is asserted, not derived.** Client sends `YYYY-MM-DD`; `todayISO(timeZone)` exists only for server-initiated work | `shared/src/domain/date.ts`, `shared/src/domain/streak.ts`, `shared/tests/streak.test.ts` |
| **Central error handling.** Routes never format errors; `NotFound` is returned for other users' rows so 403 cannot confirm existence | `server/src/errors.ts`, `server/src/middleware/errorHandler.ts` |
| **Validation at the boundary**, replacing parsed values so handlers see coercions | `server/src/middleware/validate.ts` |

## 6. Disposition of your earlier findings

All accepted and implemented except rate limiting.

| Finding | Outcome | File |
|---|---|---|
| `options=-c search_path` unreliable through the pooler | Abandoned; runtime SQL schema-qualified | `server/src/db/pool.ts`, `server/src/config.ts` |
| `migrate.ts` not pooler-safe | Own pool on the session pooler, closed in `finally` | `server/src/db/migrate.ts` |
| Vercel never builds `@dashboard/shared` | `buildCommand` added | `vercel.json` |
| Streak test timezone-dependent | Redesigned: `calculateStreak(dates, today)` is pure | `shared/src/domain/streak.ts` |
| Login timing leak | Constant-time via a real dummy argon2 hash | `server/src/services/password.ts` (`DUMMY_HASH`), used in `server/src/routes/auth.ts` |
| **Rate limiting** | **Declined** — see below | — |
| Password change leaves other sessions live | Invalidates all, then regenerates the caller's | `server/src/repositories/users.ts` (`updatePasswordHash`) |
| `/register` missing `regenerate()` | Added | `server/src/routes/auth.ts` |
| "Structural authorization" is a convention | Conceded; ownership tests are the enforcement | `server/tests/profile.test.ts` |
| `'usda'` breaks the import | Already handled | spec §8; `shared/src/types.ts` (`FoodExternalSource`) |

**One of your premises was wrong, and it matters.** The spend-cap advice does not
apply: this is Vercel **Hobby**, which has no payment method and no Spend Management
(Pro-only). Exceeding a usage limit **pauses the deployment**, it does not bill.
So skipping rate limiting risks downtime, not money — which made the decision easier,
not harder. Attack Challenge Mode in Vercel Firewall is the free reactive lever.
Recorded in `docs/superpowers/reviews/2026-08-06-review-round-2-reply.md`.

Also declined as disproportionate at three users: branded `UserId` type, the
`no-restricted-syntax` ESLint rule (the ownership test catches more), and
`failed_attempts` / `locked_until` columns.

## 7. Problems found while building

Things the plans asserted that turned out false, caught by executing them. Useful
because a reviewer reading only the spec would review a codebase that does not exist.

| Problem | Resolution |
|---|---|
| `FoodHit` types written from memory, not read from source — wrong field names and nullability, 14 compile errors | Corrected against v1's `src/hooks/useFoodSearch.ts`; now in `shared/src/types.ts` |
| Plan claimed v1 enabled `noUncheckedIndexedAccess`; it did not | `shared/src/domain/streak.ts` needed loop-index handling |
| `@types/connect-pg-simple` missing from the dependency list | `server/package.json` |
| Root tsconfig flagged every `req.userId` in `api/` | `tsconfig.json` now includes `server/src/types` |
| **`session` has no foreign key to `users`**, so `ON DELETE CASCADE` never touched it — deletion would have orphaned sessions forever | Explicit delete in `server/src/repositories/profiles.ts` (`deleteAccount`) |
| Vercel: "No Output Directory named public" — a `buildCommand` makes it expect static output | `public/index.html` + `outputDirectory` in `vercel.json` |
| `create-rsbuild` produced React 19, Tailwind 4, RSBuild 2, TS 6 rather than the planned stack | Adopted. `lucide-react` bumped to 1.x (0.363 caps at React 18); `@testing-library/react` v16 needed; TS 6 deprecates `moduleResolution: node10` so `shared`/`server` moved to `node16` in `tsconfig.base.json` — still CommonJS, still extensionless imports |
| Client build failed because the project was briefly nested inside the v1 folder, and **PostCSS resolves config by walking up the tree** — it found v1's Tailwind **v3** config and post-processed the v4 output | Project moved out to a sibling directory. A temporary empty `client/postcss.config.mjs` had blocked the upward search; it was **deleted** after the move and the build re-verified without it, which is the proof the root cause is gone rather than masked. *(That file intentionally no longer exists — do not look for it.)* |

## 8. Worth reviewing

Ordered by how much damage a wrong answer causes.

1. **Two connection paths** — `server/src/db/pool.ts`, `server/src/db/migrate.ts`,
   `server/src/config.ts`. Runtime qualified, migrations unqualified-with-`SET`. Any
   place still silently depending on `search_path`?
2. **Ownership enforcement** — `server/src/repositories/*.ts` and the
   `describe("ownership scoping")` block in `server/tests/profile.test.ts`. Is
   `userId`-first plus a per-repository test genuinely sufficient as an RLS
   replacement, given every later phase adds repositories?
3. **The date model** — `shared/src/domain/date.ts`, `shared/src/domain/streak.ts`.
   Client asserts the calendar day; the server never infers it. Does that hold for
   streaks and daily aggregates spanning timezones?
4. **Login timing test** — `server/tests/auth.test.ts`, "takes comparable time for
   unknown and known emails". Asserts `max/min < 5`. Tight enough to catch a missing
   dummy hash, loose enough not to flake on a cold invocation?
5. **Phase 3 is the data migration** — moving real gym and body-weight history from
   v1's `public` tables into `app` through a user-facing import endpoint. Designed
   only at spec level (`docs/superpowers/specs/2026-08-05-dashboard-rebuild-design.md`
   §8); no plan written. **Highest-risk remaining work.**
