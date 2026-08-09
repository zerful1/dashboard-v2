import type { RequestHandler } from "express";
import { Unauthorized } from "../errors";

/**
 * The single place req.userId is assigned, and it reads only from the session —
 * never from a body, param or query string, which a caller controls.
 *
 * Mount at router level (`router.use(requireAuth)`) rather than per-route, so a
 * route added later is protected by default instead of by remembering.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = req.session.userId;
  if (!userId) {
    next(new Unauthorized());
    return;
  }
  req.userId = userId;
  next();
};
