import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { listTargets, insertTarget } from "../repositories/nutritionTargets";

export const nutritionRouter = Router();

// Router level, so a route added to this file is protected by default.
nutritionRouter.use(requireAuth);

// The client resolves its own calendar day and sends it. The server never
// infers one: a deployed host is UTC for everyone.
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const targetBody = z.object({
  effective_from: isoDate,
  goal_mode: z.enum(["cut", "maintain", "bulk"]),
  calories: z.number().int().positive().max(10000),
  protein_g: z.number().int().min(0).max(1000),
  fat_g: z.number().int().min(0).max(1000),
  carbs_g: z.number().int().min(0).max(1500),
});

nutritionRouter.get("/targets", async (req, res, next) => {
  try {
    res.json(await listTargets(req.userId));
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post("/targets", validate({ body: targetBody }), async (req, res, next) => {
  try {
    res.status(201).json(await insertTarget(req.userId, req.body as z.infer<typeof targetBody>));
  } catch (err) {
    next(err);
  }
});
