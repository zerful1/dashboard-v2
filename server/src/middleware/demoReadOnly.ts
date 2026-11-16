import type { RequestHandler } from "express";
import { Forbidden } from "../errors";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
// Endpoints a demo session may still use: leaving, entering, and auth acting for a caller with no identity.
const ALLOWED = new Set([
  "/api/auth/logout",
  "/api/auth/demo",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

/** Read-only demo on the server, mounted first so later routes are covered; relies on no GET writing. */
export const demoReadOnly: RequestHandler = (req, _res, next) => {
  if (!req.session?.demo || READS.has(req.method) || ALLOWED.has(req.path)) {
    next();
    return;
  }
  next(new Forbidden("This is a read-only demo — nothing you change is saved"));
};
