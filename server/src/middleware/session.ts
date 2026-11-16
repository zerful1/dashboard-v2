import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db/pool";
import { config } from "../config";

const PgStore = connectPgSimple(session);

/** Cookie sessions in Postgres: logout truly invalidates, and MemoryStore fails across serverless instances. */
export const sessionMiddleware = session({
  name: "dash.sid",
  secret: config.SESSION_SECRET,
  resave: false,
  // No session row for anonymous visitors; one is created on first write.
  saveUninitialized: false,
  // Refresh the window on activity, so an active user is never logged out mid-use.
  rolling: true,
  store: new PgStore({
    pool,
    tableName: "session",
    schemaName: config.DB_SCHEMA,
    createTableIfMissing: false,
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});
