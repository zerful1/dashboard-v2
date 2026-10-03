import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { listWeights, upsertWeight, deleteWeight } from "../repositories/bodyWeight";
import { NotFound } from "../errors";
import { fillWeightGoalStart } from "../repositories/goals";

export const weightRouter = Router();

// Mounted at router level so a route added to this file is protected by
// default. Forgetting requireAuth on one handler is the kind of mistake that
// only shows up in a security review.
weightRouter.use(requireAuth);

const entryBody = z.object({
  // The client resolves its own calendar day and sends it; the server never
  // infers one. A server-side "today" would be wrong for anyone not sharing the
  // deployment's timezone, and would silently change meaning at midnight UTC.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  weight_kg: z.number().positive().max(500),
  notes: z.string().max(500).nullish(),
});

weightRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listWeights(req.userId));
  } catch (err) {
    next(err);
  }
});

// POST upserts, so there is deliberately no PATCH: one weigh-in per day means
// "edit today's" and "add today's" are the same operation, and a second route
// would just be a second way to reach the same statement.
weightRouter.post("/", validate({ body: entryBody }), async (req, res, next) => {
  try {
    const entry = await upsertWeight(req.userId, req.body as z.infer<typeof entryBody>);
    // A weight goal set before any weigh-in takes this one as its start.
    await fillWeightGoalStart(req.userId, entry.weight_kg);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

weightRouter.delete(
  "/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const ok = await deleteWeight(req.userId, req.params.id!);
      if (!ok) {
        // 404 rather than 403 for another user's row. A 403 would confirm the
        // row exists, turning the endpoint into an existence oracle for ids
        // the caller is not allowed to see. The repository cannot tell the two
        // cases apart either, which is the point: it returns false for both
        // "no such row" and "not yours".
        next(new NotFound("Entry not found"));
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);
