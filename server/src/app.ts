import express, { type Express } from "express";
import helmet from "helmet";
import { sessionMiddleware } from "./middleware/session";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { weightRouter } from "./routes/weight";
import { splitRouter } from "./routes/split";
import { exercisesRouter } from "./routes/exercises";
import { workoutsRouter } from "./routes/workouts";
import { cardioRouter } from "./routes/cardio";
import { pool } from "./db/pool";
import { config } from "./config";

/**
 * Builds the Express app. A factory rather than a module-level singleton so tests
 * can construct isolated instances, and so nothing mutable lives at module scope
 * where concurrent serverless invocations would share it.
 */
export function createApp(): Express {
  const app = express();

  // Required for `secure` cookies to be set behind a TLS-terminating proxy.
  app.set("trust proxy", 1);

  // CSP is OFF. The client uses inline style attributes - Motion writes
  // transforms, Recharts sizes its SVG - which a default policy blocks, and a
  // working policy needs its own pass with the built client in front of it.
  // Everything else helmet sets is safe as-is, including the x-powered-by
  // removal that used to be explicit above.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(express.json({ limit: "1mb" }));

  // Credentialed CORS: the origin must be echoed exactly — a wildcard is rejected
  // by browsers when Allow-Credentials is true, and the session cookie would never
  // be sent.
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

  app.use(sessionMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * Keeps the Supabase free tier from pausing.
   *
   * A free project is paused after roughly a week of inactivity and has to be
   * resumed by hand — which, on a portfolio piece, means the link is dead exactly
   * when someone clicks it. A daily Vercel cron touching the database avoids that.
   */
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

  app.use(errorHandler);
  return app;
}
