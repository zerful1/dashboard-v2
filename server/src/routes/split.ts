import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { getSplit, saveSplit } from "../repositories/split";

export const splitRouter = Router();
splitRouter.use(requireAuth);

const dayTypeSchema = z.union([z.number().int().positive(), z.literal("rest")]);

const configSchema = z
  .object({
    days: z
      .array(
        z.object({
          day_type: z.number().int().positive(),
          label: z.string().trim().min(1).max(30),
        }),
      )
      .min(1)
      .max(14),
    // Exactly seven, Monday-first. A shorter array would make getTodayDayType
    // silently return 'rest' for the missing days rather than failing.
    week: z.array(dayTypeSchema).length(7),
  })
  .refine(
    (c) => {
      const types = new Set(c.days.map((d) => d.day_type));
      return c.week.every((slot) => slot === "rest" || types.has(slot));
    },
    { message: "Every week slot must be 'rest' or an existing day_type" },
  );

splitRouter.get("/", async (req, res, next) => {
  try {
    res.json(await getSplit(req.userId));
  } catch (err) {
    next(err);
  }
});

splitRouter.put("/", validate({ body: configSchema }), async (req, res, next) => {
  try {
    res.json(await saveSplit(req.userId, req.body as z.infer<typeof configSchema>));
  } catch (err) {
    next(err);
  }
});
