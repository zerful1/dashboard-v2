import express, { type Express } from "express";
import { sessionMiddleware } from "./middleware/session";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
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
  app.disable("x-powered-by");

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

  app.use("/api/auth", authRouter);

  app.use(errorHandler);
  return app;
}
