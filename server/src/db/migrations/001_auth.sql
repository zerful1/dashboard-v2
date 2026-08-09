-- Auth and profile tables.
--
-- Deliberately unqualified: this file runs over the SESSION pooler, where
-- `SET search_path` set by the runner persists, so the DDL lands in whichever
-- schema is being migrated (app, or app_test under vitest). Keeping it unqualified
-- is what lets one static .sql file serve both.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercase is enforced rather than assumed, so UNIQUE genuinely means
  -- "one account per address" without needing the citext extension.
  email         text NOT NULL UNIQUE
                CHECK (email = lower(email) AND position('@' in email) > 1),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  avatar_path  text,
  -- Display preference only; everything is stored in kg.
  units        text NOT NULL DEFAULT 'kg' CHECK (units IN ('kg', 'lb')),
  timezone     text NOT NULL DEFAULT 'Europe/London',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Only the SHA-256 of the token is stored, so a database leak does not hand
  -- over working reset links.
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- connect-pg-simple's expected shape; the library does not create this itself
-- (createTableIfMissing is off).
--
-- `jsonb` rather than the library's shipped `json`: node-pg parses both back to
-- objects and the library hands over an already-stringified value, so it is
-- indifferent — but jsonb can be indexed, which session invalidation needs.
CREATE TABLE session (
  sid    varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess   jsonb NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX session_expire_idx ON session (expire);

-- Btree expression index, not GIN: exactly one key is ever looked up, when
-- invalidating every session belonging to a user after a password change.
CREATE INDEX session_user_idx ON session ((sess->>'userId'));
