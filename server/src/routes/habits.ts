import { Router } from "express";
import { z } from "zod";
import { isRealDate, MAX_HABITS } from "@dashboard/shared";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { BadRequest, Conflict, NotFound } from "../errors";
import { addHabit, deleteHabit, listHabits, reorderHabits, setDone, updateHabit } from "../repositories/habits";

export const habitsRouter = Router();
// Router level, so a route added to this file is protected by default.
habitsRouter.use(requireAuth);

const isoDate = z.string().refine(isRealDate, "Expected a date as YYYY-MM-DD");
const idParams = z.object({ id: z.string().uuid() });
const dayParams = z.object({ id: z.string().uuid(), date: isoDate });
const name = z.string().trim().min(1, "Give the habit a name").max(40, "Keep the name to 40 characters");
// Blank becomes null, so an emptied field clears the emoji.
const emoji = z.string().trim().max(16, "Keep the emoji to 16 characters").transform((s) => s || null);
// Nullable as well as optional: the app sends `emoji: null` for "no emoji".
const addBody = z.object({ name, emoji: emoji.nullable().optional() });
const patchBody = z
  .object({ name: name.optional(), emoji: emoji.nullable().optional() })
  .refine((b) => b.name !== undefined || b.emoji !== undefined, "Nothing to change");
const notFound = () => new NotFound("Habit not found");

// Reads only (CLAUDE.md: no GET writes). `today` is the caller's own date.
habitsRouter.get("/", validate({ query: z.object({ today: isoDate }) }), async (req, res, next) => {
  try {
    res.json(await listHabits(req.userId, (req.query as unknown as { today: string }).today));
  } catch (err) {
    next(err);
  }
});

habitsRouter.post("/", validate({ body: addBody }), async (req, res, next) => {
  try {
    const b = req.body as z.infer<typeof addBody>;
    const habit = await addHabit(req.userId, b.name, b.emoji ?? null);
    if (habit === "full") return next(new Conflict(`You can have up to ${MAX_HABITS} habits`));
    res.status(201).json(habit);
  } catch (err) {
    next(err);
  }
});

habitsRouter.post(
  "/reorder",
  validate({ body: z.object({ ids: z.array(z.string().uuid()).max(MAX_HABITS) }) }),
  async (req, res, next) => {
    try {
      // 400 without saying which id was wrong: a foreign id isn't confirmed to exist.
      if (!(await reorderHabits(req.userId, (req.body as { ids: string[] }).ids))) {
        return next(new BadRequest("That isn't your full list of habits"));
      }
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  },
);

habitsRouter.patch("/:id", validate({ params: idParams, body: patchBody }), async (req, res, next) => {
  try {
    const habit = await updateHabit(req.userId, req.params.id!, req.body as z.infer<typeof patchBody>);
    if (!habit) return next(notFound());
    res.json(habit);
  } catch (err) {
    next(err);
  }
});

habitsRouter.delete("/:id", validate({ params: idParams }), async (req, res, next) => {
  try {
    // 404, not 403, for another user's id: a foreign id is not confirmed to exist.
    if (!(await deleteHabit(req.userId, req.params.id!))) return next(notFound());
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

// PUT and DELETE rather than a toggle: repeating either is harmless.
for (const [method, done] of [["put", true], ["delete", false]] as const) {
  habitsRouter[method]("/:id/days/:date", validate({ params: dayParams }), async (req, res, next) => {
    try {
      if (!(await setDone(req.userId, req.params.id!, req.params.date!, done))) return next(notFound());
      res.sendStatus(204);
    } catch (err) {
      next(err);
    }
  });
}
