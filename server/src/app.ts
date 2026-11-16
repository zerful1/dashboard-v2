import express, { type Express } from "express";
import helmet from "helmet";
import { sessionMiddleware } from "./middleware/session";
import { demoReadOnly } from "./middleware/demoReadOnly";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { weightRouter } from "./routes/weight";
import { splitRouter } from "./routes/split";
import { exercisesRouter } from "./routes/exercises";
import { workoutsRouter } from "./routes/workouts";
import { cardioRouter } from "./routes/cardio";
import { nutritionRouter } from "./routes/nutrition";
import { foodRouter } from "./routes/food";
import { insightsRouter } from "./routes/insights";
import { goalsRouter } from "./routes/goals";
import { exportRouter } from "./routes/export";
import { habitsRouter } from "./routes/habits";
import { restoreRouter } from "./routes/restore";
import { pool } from "./db/pool";
import { config } from "./config";
import { parseSignupPolicy, type SignupPolicy } from "./signups";
import { buildRateLimits } from "./middleware/rateLimit";

/** A factory, so tests get isolated instances and nothing mutable sits at module scope. */
export function createApp(options: { signups?: SignupPolicy; rateLimits?: boolean } = {}): Express {
  const app = express();

  // Per app instance, read by the register route through req.app.locals.
  app.locals.signupPolicy = options.signups ?? parseSignupPolicy(config.SIGNUP_ALLOWLIST);

  // Required for `secure` cookies to be set behind a TLS-terminating proxy.
  app.set("trust proxy", 1);

  // CSP is off: the client's inline styles (Motion, Recharts SVG) would be blocked by a default policy.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Restore reads a whole download, so it brings its own larger parser.
  const json = express.json({ limit: "1mb" });
  app.use((req, res, next) => (req.path.startsWith("/api/restore") ? next() : json(req, res, next)));

  // Credentialed CORS needs the origin echoed exactly: browsers reject a wildcard with Allow-Credentials.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", config.APP_ORIGIN);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Before the session so a refused request costs no database read; after the body parser.
  if (options.rateLimits ?? !config.isTest) {
    const limits = buildRateLimits();
    app.use("/api/auth", limits.auth);
    app.use("/api/auth/forgot-password", limits.forgotPassword);
    app.use("/api/food", limits.food);
    app.use("/api/profile", limits.accountDelete);
  }

  app.use(sessionMiddleware);
  app.use(demoReadOnly);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** Keeps the Supabase free tier from pausing: a daily Vercel cron touches the database. */
  app.get("/api/cron/keepalive", async (_req, res, next) => {
    try {
      const { rows } = await pool.query<{ now: Date }>("SELECT now() as now");
      res.json({ ok: true, db: rows[0]?.now ?? null });
    } catch (err) {
      next(err);
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/weight", weightRouter);
  app.use("/api/split", splitRouter);
  app.use("/api/exercises", exercisesRouter);
  app.use("/api/workouts", workoutsRouter);
  app.use("/api/cardio", cardioRouter);
  app.use("/api/nutrition", nutritionRouter);
  app.use("/api/food", foodRouter);
  app.use("/api/insights", insightsRouter);
  app.use("/api/goals", goalsRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/habits", habitsRouter);
  app.use("/api/restore", restoreRouter);

  app.use(errorHandler);
  return app;
}
