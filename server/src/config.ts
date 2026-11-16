import { resolve } from "node:path";
import { z } from "zod";
import * as dotenv from "dotenv";

// Resolved from __dirname, not cwd: tests run with cwd=server/, where a bare dotenv.config() finds nothing.
dotenv.config({ path: resolve(__dirname, "../../.env") });

const schema = z.object({
  /** Transaction pooler (6543). No connection state survives between statements. */
  DATABASE_URL: z.string().min(1),
  /** Session pooler (5432). Holds one backend, so SET search_path persists. */
  MIGRATION_DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  DB_SCHEMA: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/, "must be a bare lowercase identifier")
    .default("app"),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM: z.string().default("Dashboard <onboarding@resend.dev>"),
  // Bare origin: a trailing slash would reach reset links as "//reset-password" and CORS as a non-origin.
  APP_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:5173")
    .transform((u) => new URL(u).origin)
    // "localhost:5173" parses as a scheme with origin "null", which a sandboxed iframe sends: never CORS.
    .refine((o) => o !== "null", "must be an http(s) origin"),
  /** Who may register: empty = nobody new, "*" = anyone, or a list. See signups.ts. */
  SIGNUP_ALLOWLIST: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Fail loudly at startup; no fallback SESSION_SECRET, or anyone reading the source could forge a cookie.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const isTest = parsed.data.NODE_ENV === "test";

export const config = {
  ...parsed.data,
  DATABASE_URL:
    isTest && parsed.data.TEST_DATABASE_URL
      ? parsed.data.TEST_DATABASE_URL
      : parsed.data.DATABASE_URL,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest,
};

/** Schema-qualified table names: the transaction pooler keeps no search_path, and a typo fails to compile. */
const S = parsed.data.DB_SCHEMA;

export const T = {
  users: `${S}.users`,
  profiles: `${S}.profiles`,
  passwordResetTokens: `${S}.password_reset_tokens`,
  session: `${S}.session`,
  // domain
  bodyWeight: `${S}.body_weight`,
  exercises: `${S}.exercises`,
  workoutSessions: `${S}.workout_sessions`,
  workoutSets: `${S}.workout_sets`,
  cardioEntries: `${S}.cardio_entries`,
  workoutSplit: `${S}.workout_split`,
  habits: `${S}.habits`,
  habitCompletions: `${S}.habit_completions`,
  nutritionTargets: `${S}.nutrition_targets`,
  foodItems: `${S}.food_items`,
  foodLogEntries: `${S}.food_log_entries`,
  cofidFoods: `${S}.cofid_foods`,
  goals: `${S}.goals`,
} as const;
