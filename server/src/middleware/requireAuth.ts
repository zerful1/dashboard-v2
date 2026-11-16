import type { RequestHandler } from "express";
import { Unauthorized } from "../errors";

/** The only place req.userId is assigned, from the session alone; mount at router level. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = req.session.userId;
  if (!userId) {
    next(new Unauthorized());
    return;
  }
  req.userId = userId;
  next();
};
