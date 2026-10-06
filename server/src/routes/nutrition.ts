import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { listTargets, insertTarget } from "../repositories/nutritionTargets";
import { NotFound } from "../errors";
import {
  addEntry, copyDay, deleteEntry, listDiary, listEntryCalories, listRecents, rescaleEntry,
} from "../repositories/foodLog";
import type { DiaryEntryInput } from "@dashboard/shared";
import {
  distinctLoggedDates, mifflinStJeor, plausibleAdaptive, shiftISO, tdeeFromLog, TDEE_WINDOW_DAYS,
} from "@dashboard/shared";
import type { BodyWeightEntry, Profile, TdeeHint } from "@dashboard/shared";
import { getProfile } from "../repositories/profiles";
import { listWeights } from "../repositories/bodyWeight";

export const nutritionRouter = Router();

// Router level, so a route added to this file is protected by default.
nutritionRouter.use(requireAuth);

// The client resolves its own calendar day and sends it. The server never
// infers one: a deployed host is UTC for everyone.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

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

const amount = z.number().positive().max(100000);
const grams = z.number().min(0).max(5000);
const perAmount = z.number().min(0).max(20000).nullable();
const label = z.number().min(0).max(1000).nullish();

const foodBody = z
  .object({
    source: z.enum(["off", "cofid", "manual"]),
    external_id: z.string().min(1).max(100).nullable(),
    name: z.string().trim().min(1).max(200),
    brand: z.string().trim().max(200).nullable(),
    barcode: z.string().regex(/^\d{8,14}$/, "A barcode is 8 to 14 digits").nullable().optional(),
    serving_description: z.string().trim().max(100).nullable(),
    serving_grams: z.number().positive().max(5000).nullable(),
    kcal_per_serving: perAmount,
    protein_per_serving: perAmount,
    fat_per_serving: perAmount,
    carbs_per_serving: perAmount,
    kcal_per_100g: perAmount,
    protein_per_100g: perAmount,
    fat_per_100g: perAmount,
    carbs_per_100g: perAmount,
    fibre_per_100g: perAmount,
    sugar_per_100g: perAmount,
    sat_fat_per_100g: perAmount,
    salt_per_100g: perAmount,
    fibre_per_serving: perAmount,
    sugar_per_serving: perAmount,
    sat_fat_per_serving: perAmount,
    salt_per_serving: perAmount,
  })
  .refine((f) => (f.source === "manual") === (f.external_id === null), {
    message: "external_id is required for search foods and must be empty for manual ones",
  });

const entryBody = z
  .object({
    date: isoDate,
    name: z.string().trim().min(1).max(200),
    quantity: amount,
    unit: z.enum(["serving", "g"]),
    calories: z.number().min(0).max(20000),
    protein_g: grams,
    fat_g: grams,
    carbs_g: grams,
    fibre_g: label,
    sugar_g: label,
    sat_fat_g: label,
    salt_g: label,
    food_item_id: z.string().uuid().optional(),
    food: foodBody.optional(),
  })
  .refine((b) => !(b.food_item_id && b.food), { message: "Send food_item_id or food, not both" });

const idParam = z.object({ id: z.string().uuid() });

const copyBody = z
  .object({ from: isoDate, to: isoDate })
  .refine((b) => b.from !== b.to, { message: "Pick a different day to copy from" });

nutritionRouter.get("/diary", validate({ query: z.object({ date: isoDate }) }), async (req, res, next) => {
  try {
    res.json(await listDiary(req.userId, (req.query as { date: string }).date));
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post("/diary", validate({ body: entryBody }), async (req, res, next) => {
  try {
    const entry = await addEntry(req.userId, req.body as DiaryEntryInput);
    if (!entry) {
      // Not the caller's food. 404, not 403 - see weight.ts.
      next(new NotFound("Food not found"));
      return;
    }
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post("/diary/copy", validate({ body: copyBody }), async (req, res, next) => {
  try {
    const { from, to } = req.body as z.infer<typeof copyBody>;
    res.status(201).json(await copyDay(req.userId, from, to));
  } catch (err) {
    next(err);
  }
});

nutritionRouter.patch(
  "/diary/:id",
  validate({ params: idParam, body: z.object({ quantity: amount }) }),
  async (req, res, next) => {
    try {
      const entry = await rescaleEntry(req.userId, req.params.id!, (req.body as { quantity: number }).quantity);
      if (!entry) {
        next(new NotFound("Entry not found"));
        return;
      }
      res.json(entry);
    } catch (err) {
      next(err);
    }
  },
);

nutritionRouter.delete("/diary/:id", validate({ params: idParam }), async (req, res, next) => {
  try {
    if (!(await deleteEntry(req.userId, req.params.id!))) {
      next(new NotFound("Entry not found"));
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

nutritionRouter.get("/recents", async (req, res, next) => {
  try {
    res.json(await listRecents(req.userId));
  } catch (err) {
    next(err);
  }
});

/** The formula hint, or null until all four body details and a weigh-in exist. */
function formulaHint(profile: Profile | null, latest: BodyWeightEntry | null, today: string): TdeeHint["formula"] {
  if (!profile || !latest) return null;
  const { height_cm, birth_year, sex, activity_level } = profile;
  if (height_cm === null || birth_year === null || sex === null || activity_level === null) return null;
  // A hint, so the year is precise enough: nobody's maintenance moves on their birthday.
  const age = Number(today.slice(0, 4)) - birth_year;
  return {
    kcal: mifflinStJeor({ weightKg: latest.weight_kg, heightCm: height_cm, age, sex, activity: activity_level }),
    weight_kg: latest.weight_kg,
    age,
  };
}

nutritionRouter.get("/tdee", validate({ query: z.object({ today: isoDate }) }), async (req, res, next) => {
  try {
    const { today } = req.query as { today: string };
    // The 28 days ending YESTERDAY: today is still being eaten.
    const windowStart = shiftISO(today, -TDEE_WINDOW_DAYS);
    const windowEnd = shiftISO(today, -1);
    const [profile, weightsNewestFirst, entries] = await Promise.all([
      getProfile(req.userId),
      listWeights(req.userId),
      listEntryCalories(req.userId, windowStart, windowEnd),
    ]);
    const latest = weightsNewestFirst.find((w) => w.date <= today) ?? null;
    const adaptive = tdeeFromLog({ entries, weights: [...weightsNewestFirst].reverse(), windowStart, windowEnd });
    const formula = formulaHint(profile, latest, today);
    const body: TdeeHint = {
      formula,
      adaptive:
        adaptive && plausibleAdaptive(adaptive.kcal, formula?.kcal ?? null)
          ? { kcal: adaptive.kcal, days_logged: adaptive.daysLogged, weigh_ins: adaptive.weighIns }
          : null,
      days_logged: distinctLoggedDates(entries).length,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});
