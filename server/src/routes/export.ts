import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getDataSummary, writeUserExport } from "../repositories/export";

export const exportRouter = Router();
// Router level, so a route added to this file is protected by default.
exportRouter.use(requireAuth);

// What Settings shows beside the download.
exportRouter.get("/summary", async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(await getDataSummary(req.userId));
  } catch (err) {
    next(err);
  }
});

// Reads only, so the demo's read-only rule (CLAUDE.md: no GET writes) holds.
exportRouter.get("/", async (req, res, next) => {
  // Personal data: no browser cache keeps a copy.
  res.set("Cache-Control", "no-store").type("application/json");
  try {
    // Streamed per table: Vercel caps a single-piece response at 4.5 MB. Backpressure ignored (small file).
    await writeUserExport(req.userId, (chunk) => {
      if (res.destroyed) throw new Error("The client closed the export");
      res.write(chunk);
    });
    res.end();
  } catch (err) {
    // Status can't change once streaming starts: cut short so the client's JSON parse fails.
    if (res.headersSent) res.destroy();
    else next(err);
  }
});
