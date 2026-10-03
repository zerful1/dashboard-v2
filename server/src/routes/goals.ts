import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { addLiftGoal, deleteGoal, listGoals, setWeightGoal } from "../repositories/goals";
import { Conflict, NotFound } from "../errors";

export const goalsRouter = Router();
// Router level, so a route added to this file is protected by default.
goalsRouter.use(requireAuth);

const targetKg = z.number().positive().max(500);

goalsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listGoals(req.userId));
  } catch (err) {
    next(err);
  }
});

goalsRouter.put("/weight", validate({ body: z.object({ target_kg: targetKg }) }), async (req, res, next) => {
  try {
    res.json(await setWeightGoal(req.userId, (req.body as { target_kg: number }).target_kg));
  } catch (err) {
    next(err);
  }
});

const liftBody = z.object({ exercise_name: z.string().trim().min(1).max(80), target_kg: targetKg });

goalsRouter.post("/lifts", validate({ body: liftBody }), async (req, res, next) => {
  try {
    const b = req.body as z.infer<typeof liftBody>;
    const goal = await addLiftGoal(req.userId, b.exercise_name, b.target_kg);
    if (goal === "full") return next(new Conflict("You can have up to 5 lift goals"));
    if (goal === "duplicate") return next(new Conflict("That lift already has a goal"));
    res.status(201).json(goal);
  } catch (err) {
    next(err);
  }
});

goalsRouter.delete("/:id", validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res, next) => {
  try {
    // 404, not 403, for another user's id: a foreign id is not confirmed to exist.
    if (!(await deleteGoal(req.userId, req.params.id!))) return next(new NotFound("Goal not found"));
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});
