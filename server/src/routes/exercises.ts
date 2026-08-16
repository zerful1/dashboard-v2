import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { evaluateRename } from "@dashboard/shared";
import {
  listExercises,
  listAllExerciseNames,
  addExercise,
  deleteExercise,
  reorderExercises,
  renameExercise,
} from "../repositories/exercises";
import { NotFound, Conflict } from "../errors";

export const exercisesRouter = Router();
exercisesRouter.use(requireAuth);

const dayTypeQuery = z.object({ day_type: z.coerce.number().int().positive() });

exercisesRouter.get("/", validate({ query: dayTypeQuery }), async (req, res, next) => {
  try {
    const { day_type } = req.query as unknown as z.infer<typeof dayTypeQuery>;
    res.json(await listExercises(req.userId, day_type));
  } catch (err) {
    next(err);
  }
});

const addBody = z.object({
  day_type: z.number().int().positive(),
  exercise_name: z.string().trim().min(1).max(80),
});

exercisesRouter.post("/", validate({ body: addBody }), async (req, res, next) => {
  try {
    const { day_type, exercise_name } = req.body as z.infer<typeof addBody>;

    // Same-day duplicates are blocked because workout_sets is
    // UNIQUE (session_id, exercise_name, set_number) — two same-named exercises
    // in one session would clobber each other's sets. Across days they are
    // deliberately allowed and are one exercise everywhere: stats merge by name
    // and a rename cascades across days.
    const existing = await listExercises(req.userId, day_type);
    if (existing.some((e) => e.exercise_name.toLowerCase() === exercise_name.toLowerCase())) {
      next(new Conflict("That exercise is already on this day"));
      return;
    }

    res.status(201).json(await addExercise(req.userId, day_type, exercise_name));
  } catch (err) {
    next(err);
  }
});

exercisesRouter.delete(
  "/:id",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      const ok = await deleteExercise(req.userId, req.params.id!);
      if (!ok) {
        next(new NotFound("Exercise not found"));
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

const reorderBody = z.object({
  day_type: z.number().int().positive(),
  ordered_ids: z.array(z.string().uuid()).min(1),
});

exercisesRouter.post("/reorder", validate({ body: reorderBody }), async (req, res, next) => {
  try {
    const { day_type, ordered_ids } = req.body as z.infer<typeof reorderBody>;
    res.json(await reorderExercises(req.userId, day_type, ordered_ids));
  } catch (err) {
    next(err);
  }
});

const renameBody = z.object({
  old_name: z.string().trim().min(1).max(80),
  day_type: z.number().int().positive(),
  new_name: z.string().trim().min(1).max(80),
});

exercisesRouter.post("/rename", validate({ body: renameBody }), async (req, res, next) => {
  try {
    const { old_name, day_type, new_name } = req.body as z.infer<typeof renameBody>;

    const rows = await listAllExerciseNames(req.userId);
    const evaluation = evaluateRename(rows, old_name, day_type, new_name);

    if (evaluation.sameDayCollision) {
      next(new Conflict("Another exercise on this day already uses that name"));
      return;
    }

    // Renaming onto a name that exists on ANOTHER day merges the two — stats
    // group by name, so they become one exercise. Adopt that name's exact
    // casing, or the merge produces a case-variant split instead of joining
    // them, which is the thing the merge was for.
    const finalName = evaluation.mergeWith ?? new_name;

    const result = await renameExercise(req.userId, old_name, finalName);
    res.json({ ...result, merged: evaluation.mergeWith !== null });
  } catch (err) {
    next(err);
  }
});
