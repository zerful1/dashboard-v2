import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { searchCofid } from "../repositories/cofid";
import { searchOpenFoodFacts } from "../services/openFoodFacts";
import type { FoodHit, FoodSearchResult } from "@dashboard/shared";

export const foodRouter = Router();
foodRouter.use(requireAuth);

const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });

foodRouter.get("/search", validate({ query: searchQuery }), async (req, res, next) => {
  try {
    const { q } = req.query as z.infer<typeof searchQuery>;
    const [off, cofid] = await Promise.allSettled([searchOpenFoodFacts(q), searchCofid(q)]);
    const hits: FoodHit[] = [];
    const warnings: string[] = [];
    // v1's order: branded products, then the generic UK table.
    if (off.status === "fulfilled") hits.push(...off.value);
    else warnings.push("Branded foods are unavailable right now");
    if (cofid.status === "fulfilled") hits.push(...cofid.value);
    else warnings.push("The UK food table is unavailable right now");
    const body: FoodSearchResult = warnings.length > 0 ? { hits, warnings } : { hits };
    res.json(body);
  } catch (err) {
    next(err);
  }
});
