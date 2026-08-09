# dashboard-v2

Multi-user health and life tracker — gym, nutrition, habits and media. React client,
Express API, Postgres.

A rebuild of a single-user React + Supabase-client app as a proper client/server
application with its own session-based authentication.

## Setup

```bash
npm install
cp .env.example .env    # fill in the database password and a session secret
npm run migrate
npm run dev             # API on :3001
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API on :3001 |
| `npm test` | Run every workspace's tests |
| `npm run typecheck` | Typecheck all workspaces plus the Vercel entry point |
| `npm run build` | Build the shared package |
| `npm run migrate` | Apply pending migrations to `$DB_SCHEMA` |

## Layout

```
shared/   Pure domain logic and types. No I/O, imported by both halves.
server/   Express API.
api/      Vercel entry point — exports the Express app.
```

`server/` splits three ways, and the split is load-bearing:

- **`routes/`** parse requests and format responses. They never write SQL.
- **`repositories/`** own all SQL. Every function takes `userId` as its first
  parameter and scopes its `WHERE` by it.
- **`services/`** wrap external dependencies — password hashing, email.

## Authorization

The previous version relied on Postgres row-level security. This one enforces
ownership in application code, so the rule is structural rather than remembered:

- Repository functions cannot be called without a user scope.
- `req.userId` is assigned in exactly one place (`requireAuth`) and read only from
  the session — never from a body, param or query string.
- `requireAuth` is mounted at router level, so new routes are protected by default.
- Every repository has a test asserting one user cannot read or write another's rows.

## Database

One Supabase Postgres, two connection paths:

| | Port | Why |
|---|---|---|
| Runtime | 6543 (transaction pooler) | Connection state does not persist, so all queries are schema-qualified via `T` |
| Migrations | 5432 (session pooler) | Holds one backend, so `SET search_path` persists and DDL stays unqualified |

The application lives in the `app` schema. Tests use `app_test`, and
`server/tests/setup.ts` refuses to run against anything else.

## Sessions

`express-session` with an httpOnly `SameSite=Lax` cookie, stored in Postgres via
`connect-pg-simple`. Sessions rather than JWT because logout genuinely invalidates —
the server row is deleted — and there is no token for XSS to steal.

Passwords are argon2id at OWASP's recommended parameters. Login always performs a
verify, against a dummy hash when the email is unknown, so response time does not
reveal which addresses have accounts.
