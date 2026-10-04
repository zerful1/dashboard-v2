import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { searchCofid } from "../repositories/cofid";
import { lookupBarcode, searchOpenFoodFacts } from "../services/openFoodFacts";
import { findFoodByBarcode } from "../repositories/foodItems";
import { AppError, NotFound } from "../errors";
import type { BarcodeResult, FoodHit, FoodSearchResult } from "@dashboard/shared";

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

const barcodeParams = z.object({ code: z.string().regex(/^\d{8,14}$/, "A barcode is 8 to 14 digits") });

// Reads only (CLAUDE.md: no GET writes), so the read-only demo can scan too.
foodRouter.get("/barcode/:code", validate({ params: barcodeParams }), async (req, res, next) => {
  try {
    const { code } = req.params as { code: string };
    // The library first: a food scanned or added before comes back as saved.
    const item = await findFoodByBarcode(req.userId, code);
    if (item) {
      const body: BarcodeResult = { source: "library", item };
      res.json(body);
      return;
    }
    let hit;
    try {
      // Scanners read UPC-A as 12 digits; Open Food Facts often files it as EAN-13.
      hit = (await lookupBarcode(code)) ?? (code.length === 12 ? await lookupBarcode(`0${code}`) : null);
    } catch {
      next(new AppError(502, "Product lookup is unavailable right now", "bad_gateway"));
      return;
    }
    if (!hit) {
      next(new NotFound("That barcode isn't in Open Food Facts"));
      return;
    }
    const body: BarcodeResult = { source: "off", hit };
    res.json(body);
  } catch (err) {
    next(err);
  }
});
