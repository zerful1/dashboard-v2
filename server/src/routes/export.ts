import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { exportUserData } from "../repositories/export";

export const exportRouter = Router();
// Router level, so a route added to this file is protected by default.
exportRouter.use(requireAuth);

// Reads only, so the demo's read-only rule (CLAUDE.md: no GET writes) holds.
exportRouter.get("/", async (req, res, next) => {
  try {
    const file = await exportUserData(req.userId);
    // Personal data: no browser cache keeps a copy. The service worker
    // already never caches /api.
    res.set("Cache-Control", "no-store").json(file);
  } catch (err) {
    next(err);
  }
});
