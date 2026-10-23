# Dashboard

A personal tracker for training, body weight, food and habits. Phone-first, black and white, and it keeps working offline.

**[Open the app](https://dashboard-v2-nine-phi.vercel.app/)** → "Try the demo" needs no account.

**[About this project](https://dashboard-v2-nine-phi.vercel.app/about)**: what it does and how it was built.

<p align="center">
  <img src="docs/screenshots/home.png" width="250" alt="Home: today at a glance">
  <img src="docs/screenshots/weight.png" width="250" alt="Weight: the 7-day average, the rate and the goal">
  <img src="docs/screenshots/food.png" width="250" alt="Food: a day against its targets">
</p>

## What it does

- **Home:** today at a glance, with the weigh-in, the workout, food left and habits.
- **Gym:** log sets beside last time, see each lift as moving, stalled or going back, and browse 12 weeks of history.
- **Weight:** the 7-day average, the rate per week and when you'll reach your goal, by week or by month.
- **Food:** a diary against your targets, barcode scanning, and the last 7 days at a glance.
- **Insights:** a weekly review, personal records and goal projections.
- **Habits:** daily ticks from Home.

It installs to the home screen, reads offline from a saved cache, and exports everything you own as one JSON file.

## Stack

React 19 · RSBuild · Tailwind 4 · TanStack Query 5 · Express 4 · Postgres 17 (Supabase) · Vercel

## Run it locally

You need Node 20.19+ (or 22.12+) and Postgres 13 or later. Any Postgres works: locally all three database URLs in `.env` can be the same one, such as `postgresql://postgres:postgres@localhost:5432/dashboard`. Production uses Supabase's transaction and session poolers, which is why there are separate URLs. Each environment gets its own schema in that one database: `app_dev` locally, `app_test` for the tests.

```bash
npm install
cp .env.example .env     # then set the database URLs and SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # a SESSION_SECRET
npm run migrate
npm run dev:api          # API on :3001
npm run dev:web          # app on :5173, proxying /api to the API
```

- **Sign-ups:** the example `.env` sets `SIGNUP_ALLOWLIST=*` so you can register locally. Unset, nobody new can register, which is how production runs. **Try the demo** works either way.
- **Sample history:** `npm run seed-dev -w @dashboard/server -- --email <your address> --reset` fills an account you've registered.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:api` / `npm run dev:web` | The API on :3001, the app on :5173 |
| `npm test` | Every workspace's tests. The shared and client tests need nothing; the server's use the database in `.env`, creating the `app_test` schema and wiping it before each test, and refuse to run against any other schema |
| `npm run typecheck` | Typecheck every workspace |
| `npm run build` | Build the shared package and the app |
| `npm run migrate` | Apply pending migrations to `$DB_SCHEMA` |

## Layout

```
shared/   domain logic and types, no I/O, used by both sides
server/   Express API: routes parse, repositories own the SQL, services wrap email and hashing
client/   the React app
api/      Vercel entry point, exporting the Express app
```

## How it's built

- **Ownership in code, not row-level security.** Every repository function takes the user id first and filters on it. Every repository has a test proving one user can't reach another's rows.
- **Sessions, not tokens.** An httpOnly cookie is backed by Postgres, so signing out really ends the session. Passwords are argon2id, and login takes the same time whether or not the email exists.
- **Dates are strings.** Every date stays `YYYY-MM-DD` from the database to the screen, so a clock change never shifts a day.
- **Offline without caching the API.** The service worker caches only the built app. Saved data comes from a per-user query cache, cleared at every sign-in and sign-out.

The conventions, and the reasons behind them, are in [`CLAUDE.md`](CLAUDE.md).
