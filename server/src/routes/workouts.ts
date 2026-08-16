import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { findSession, listSessions, listHistoryDayNames } from "../repositories/sessions";

export const workoutsRouter = Router();
workoutsRouter.use(requireAuth);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

workoutsRouter.get(
  "/session",
  validate({ query: z.object({ date: isoDate, day_type: z.coerce.number().int().positive() }) }),
  async (req, res, next) => {
    try {
      const { date, day_type } = req.query as unknown as { date: string; day_type: number };
      // Deliberately does NOT create. A session is created by logging a set,
      // so browsing to a day you end up not training leaves no phantom session
      // behind — which would otherwise show up in history as a workout that
      // never happened.
      res.json(await findSession(req.userId, date, day_type));
    } catch (err) {
      next(err);
    }
  },
);

workoutsRouter.get(
  "/sessions",
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      day_name: z.string().max(60).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as { limit: number; offset: number; day_name?: string };
      res.json(
        await listSessions(req.userId, {
          limit: q.limit,
          offset: q.offset,
          dayName: q.day_name,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

workoutsRouter.get("/day-names", async (req, res, next) => {
  try {
    res.json(await listHistoryDayNames(req.userId));
  } catch (err) {
    next(err);
  }
});
