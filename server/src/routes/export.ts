import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { writeUserExport } from "../repositories/export";

export const exportRouter = Router();
// Router level, so a route added to this file is protected by default.
exportRouter.use(requireAuth);

// Reads only, so the demo's read-only rule (CLAUDE.md: no GET writes) holds.
exportRouter.get("/", async (req, res, next) => {
  // Personal data: no browser cache keeps a copy. The service worker already
  // never caches /api.
  res.set("Cache-Control", "no-store").type("application/json");
  try {
    // Streamed table by table, never sent in one piece: Vercel caps a
    // single-piece response at 4.5 MB. Backpressure is ignored on purpose -
    // the file is a few MB, so buffering it for a slow reader costs no more
    // than res.json would have.
    await writeUserExport(req.userId, (chunk) => {
      if (res.destroyed) throw new Error("The client closed the export");
      res.write(chunk);
    });
    res.end();
  } catch (err) {
    // Once the first chunk is out the status can't change. Cut the response
    // short instead, so the client's JSON parse fails and it says so, rather
    // than saving half a file.
    if (res.headersSent) res.destroy();
    else next(err);
  }
});
