import type { RequestHandler } from "express";
import { Forbidden } from "../errors";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
// Leaving the demo, and entering it again, are the only writes a demo session makes.
const ALLOWED = new Set(["/api/auth/logout", "/api/auth/demo"]);

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
