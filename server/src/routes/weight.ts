import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { isoDate } from "../validation";
import { listWeights, upsertWeight, deleteWeight } from "../repositories/bodyWeight";
import { NotFound } from "../errors";
import { fillWeightGoalStart } from "../repositories/goals";

export const weightRouter = Router();

// Router level, so a route added to this file is protected by default.
weightRouter.use(requireAuth);

const entryBody = z.object({
  // The client sends its own calendar day: a server-side today is wrong outside the deployment's timezone.
  date: isoDate,
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

// POST upserts, so there is deliberately no PATCH: one weigh-in per day.
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
        // 404 not 403: a foreign id is not confirmed to exist, and the repository can't tell the cases apart.
        next(new NotFound("Entry not found"));
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);
