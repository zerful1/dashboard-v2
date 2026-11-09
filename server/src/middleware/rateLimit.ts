import type { Request, RequestHandler } from "express";
import { TooManyRequests } from "../errors";

export interface RateLimitOptions {
  /** How many requests one key may make in a window. */
  max: number;
  windowMs: number;
  /** What is counted. The caller's address unless told otherwise; null skips the request. */
  key?: (req: Request) => string | null;
  /** Injected by tests, so a window can end without waiting for it. */
  now?: () => number;
}

/** Past this many live keys, a request sweeps the expired ones before counting. */
const SWEEP_AT = 5000;

/**
 * A fixed-window limiter held in memory.
 *
 * In memory on purpose. A shared store would be exact, but the only one this
 * app has is Postgres, and a counter there is a write on every request, GETs
 * included: the food search is a GET the read-only demo may call, and no GET
 * may write (CLAUDE.md). So each warm serverless instance counts on its own
 * and the limit is approximate, which is enough for what it is for: one source
 * guessing passwords, sending reset emails or driving the food search.
 *
 * The counters belong to the handler this returns, and createApp builds the
 * handlers, so nothing mutable lives at module scope.
 */
export function rateLimit({ max, windowMs, key = (req) => req.ip ?? null, now = Date.now }: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const k = key(req);
    if (k === null) {
      next();
      return;
    }
    const t = now();
    if (hits.size >= SWEEP_AT) {
      for (const [id, hit] of hits) if (hit.resetAt <= t) hits.delete(id);
      // Still full of live keys: forget them rather than grow without bound.
      // Briefly lenient, never out of memory.
      if (hits.size >= SWEEP_AT) hits.clear();
    }
    let hit = hits.get(k);
    if (!hit || hit.resetAt <= t) {
      hit = { count: 0, resetAt: t + windowMs };
      hits.set(k, hit);
    }
    hit.count++;
    if (hit.count > max) {
      res.set("Retry-After", String(Math.ceil((hit.resetAt - t) / 1000)));
      next(new TooManyRequests());
      return;
    }
    next();
  };
}

const MINUTE = 60 * 1000;

/** Only POSTs count, and never sign-out: leaving must always work. */
const authPost = (req: Request) => (req.method === "POST" && req.path !== "/logout" ? (req.ip ?? null) : null);

/** The address a reset is asked for, so many sources can't flood one inbox. */
const resetEmail = (req: Request) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return req.method === "POST" && typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : null;
};

/**
 * The app's limits, built once per app instance. Mounted by createApp in front
 * of the session, so a refused request costs no database read.
 *
 *   /api/auth          30 POSTs per 15 minutes per address: each login is an
 *                      argon2 hash, and the demo entry opens a transaction
 *   forgot-password    5 per hour per address asked about, whether or not it
 *                      has an account, so the answer reveals nothing
 *   /api/food          60 per minute per caller: each search is up to two
 *                      requests to Open Food Facts under this app's name, and
 *                      the demo lets anyone make them. Typing a search fires
 *                      a few a second at most.
 */
export function buildRateLimits(): { auth: RequestHandler; forgotPassword: RequestHandler; food: RequestHandler } {
  return {
    auth: rateLimit({ max: 30, windowMs: 15 * MINUTE, key: authPost }),
    forgotPassword: rateLimit({ max: 5, windowMs: 60 * MINUTE, key: resetEmail }),
    food: rateLimit({ max: 60, windowMs: MINUTE }),
  };
}
