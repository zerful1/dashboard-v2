import type { RequestHandler } from "express";
import { Forbidden } from "../errors";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
// Leaving the demo, entering it again, and the endpoints that act for a caller
// with no identity: login and register regenerate the session, dropping `demo`,
// and a reset never touches the demo account (auth.ts treats its address as
// unknown). change-password acts as the signed-in account, so it stays refused.
const ALLOWED = new Set([
  "/api/auth/logout",
  "/api/auth/demo",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

/**
 * The demo is read-only on the server, not merely in the UI. Mounted once at
 * the front of the API, so a route added later is covered without anyone
 * remembering - the reasoning behind router-level requireAuth. It relies on no
 * GET handler writing (audited in the plan, Task 3).
 */
export const demoReadOnly: RequestHandler = (req, _res, next) => {
  if (!req.session?.demo || READS.has(req.method) || ALLOWED.has(req.path)) {
    next();
    return;
  }
  next(new Forbidden("This is a read-only demo — nothing you change is saved"));
};
