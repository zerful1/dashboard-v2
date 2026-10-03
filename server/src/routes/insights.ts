import { Router } from "express";
import { z } from "zod";
import { isMonday, recordEvents, shiftISO, weeklyReview } from "@dashboard/shared";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { getSplit } from "../repositories/split";
import { listTargets } from "../repositories/nutritionTargets";
import { recordRows, reviewInputs } from "../repositories/insights";

export const insightsRouter = Router();
// Router level, so a route added to this file is protected by default.
insightsRouter.use(requireAuth);

// The client names the week by its Monday; the server never works out a "today".
const weekQuery = z.object({ week: z.string().refine(isMonday, "Expected a Monday as YYYY-MM-DD") });

insightsRouter.get("/review", validate({ query: weekQuery }), async (req, res, next) => {
  try {
    const { week } = req.query as unknown as { week: string };
    // One read spanning the week before and this one.
    const [inputs, split, targets] = await Promise.all([
      reviewInputs(req.userId, shiftISO(week, -7), shiftISO(week, 6)),
      getSplit(req.userId),
      listTargets(req.userId),
    ]);
    res.json(weeklyReview(inputs, week, split, targets));
  } catch (err) {
    next(err);
  }
});

insightsRouter.get("/records", async (req, res, next) => {
  try {
    res.json(recordEvents(await recordRows(req.userId)));
  } catch (err) {
    next(err);
  }
});
