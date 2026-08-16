import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  findSession,
  listSessions,
  listHistoryDayNames,
  getOrCreateSession,
} from "../repositories/sessions";
import { getSplit } from "../repositories/split";
import { listSets, upsertSet, deleteSet, lastSessionSets } from "../repositories/sets";
import { computeRecommendation } from "@dashboard/shared";
import { recentSessionGroups } from "../repositories/coaching";
import { NotFound } from "../errors";

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

const setBody = z.object({
  date: isoDate,
  day_type: z.number().int().positive(),
  exercise_name: z.string().trim().min(1).max(80),
  set_number: z.number().int().min(1).max(20),
  weight_kg: z.number().min(0).max(500),
  reps: z.number().int().min(1).max(200),
  is_bodyweight: z.boolean().default(false),
});

workoutsRouter.post("/sets", validate({ body: setBody }), async (req, res, next) => {
  try {
    const b = req.body as z.infer<typeof setBody>;
    // Logging a set is what creates the session — the client never has to
    // create one first, and a viewed-but-unused day leaves nothing behind.
    const split = await getSplit(req.userId);
    const session = await getOrCreateSession(req.userId, b.date, b.day_type, split);

    res.status(201).json(
      await upsertSet(req.userId, {
        sessionId: session.id,
        exerciseName: b.exercise_name,
        setNumber: b.set_number,
        weightKg: b.weight_kg,
        reps: b.reps,
        isBodyweight: b.is_bodyweight,
      }),
    );
  } catch (err) {
    next(err);
  }
});

workoutsRouter.get(
  "/sets",
  validate({ query: z.object({ session_id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const { session_id } = req.query as unknown as { session_id: string };
      res.json(await listSets(req.userId, session_id));
    } catch (err) {
      next(err);
    }
  },
);

workoutsRouter.delete(
  "/sets/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const ok = await deleteSet(req.userId, req.params.id!);
      if (!ok) {
        next(new NotFound("Set not found"));
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

workoutsRouter.get(
  "/last-session",
  validate({
    query: z.object({ day_type: z.coerce.number().int().positive(), before: isoDate }),
  }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as { day_type: number; before: string };
      res.json(await lastSessionSets(req.userId, q.day_type, q.before));
    } catch (err) {
      next(err);
    }
  },
);

workoutsRouter.get(
  "/coaching",
  validate({ query: z.object({ exercise_name: z.string().trim().min(1).max(80) }) }),
  async (req, res, next) => {
    try {
      const { exercise_name } = req.query as unknown as { exercise_name: string };
      const groups = await recentSessionGroups(req.userId, exercise_name, 3);
      // null for an exercise with no history — the client renders nothing
      // rather than inventing encouragement.
      res.json(computeRecommendation(groups, exercise_name));
    } catch (err) {
      next(err);
    }
  },
);
