import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { getSplit } from "../repositories/split";
import { getOrCreateSession } from "../repositories/sessions";
import { listCardio, addCardio, updateCardio, deleteCardio } from "../repositories/cardio";
import { NotFound } from "../errors";

export const cardioRouter = Router();
cardioRouter.use(requireAuth);

const nullableNum = z.number().min(0).nullable().default(null);

const fields = z.object({
  exercise: z.string().trim().min(1).max(60),
  distance_miles: nullableNum,
  duration_minutes: z.number().int().min(0).max(1000).nullable().default(null),
  speed: nullableNum,
  incline: nullableNum,
  calories_burned: z.number().int().min(0).max(10000).nullable().default(null),
});

const createBody = fields.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day_type: z.number().int().positive(),
});

cardioRouter.get(
  "/",
  validate({ query: z.object({ session_id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const { session_id } = req.query as unknown as { session_id: string };
      res.json(await listCardio(req.userId, session_id));
    } catch (err) {
      next(err);
    }
  },
);

cardioRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
  try {
    const b = req.body as z.infer<typeof createBody>;
    // Same rule as sets: logging creates the session.
    const split = await getSplit(req.userId);
    const session = await getOrCreateSession(req.userId, b.date, b.day_type, split);
    res.status(201).json(await addCardio(req.userId, session.id, b));
  } catch (err) {
    next(err);
  }
});

cardioRouter.patch(
  "/:id",
  validate({ params: z.object({ id: z.string().uuid() }), body: fields }),
  async (req, res, next) => {
    try {
      const updated = await updateCardio(
        req.userId,
        req.params.id!,
        req.body as z.infer<typeof fields>,
      );
      if (!updated) {
        next(new NotFound("Cardio entry not found"));
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

cardioRouter.delete(
  "/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const ok = await deleteCardio(req.userId, req.params.id!);
      if (!ok) {
        next(new NotFound("Cardio entry not found"));
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);
