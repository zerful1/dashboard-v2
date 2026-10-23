import express, { Router, type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { RESTORE_MAX_BYTES } from "@dashboard/shared";
import { requireAuth } from "../middleware/requireAuth";
import { restoreUserData } from "../repositories/restore";
import { findUserById } from "../repositories/users";
import { AppError, BadRequest } from "../errors";

const COULDNT = "This file couldn't be restored. Nothing was changed.";

const envelope = z.object({
  format: z.literal("dashboard-export"),
  version: z.literal(1),
  account: z.object({ email: z.string() }),
  tables: z.record(z.array(z.record(z.unknown()))),
});

export const restoreRouter = Router();
// Router level, so a route added to this file is protected by default. Before
// the parser, so nobody signed out gets a 50 MB body read for them.
restoreRouter.use(requireAuth);
// Its own parser: the global one stops at 1 MB and skips /api/restore. The
// client sends the file gzipped (a 0.5 MB download is about 60 KB, under
// Vercel's 4.5 MB request cap); body-parser inflates it and applies this limit
// to the unpacked size.
restoreRouter.use(express.json({ limit: RESTORE_MAX_BYTES }));

/** A pg error from a value or a constraint, rather than from the connection. */
const isDataError = (err: unknown) =>
  typeof err === "object" && err !== null && /^2[23]/.test(String((err as { code?: unknown }).code));

function restoreRoute(dryRun: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only a download of another version is told so. Anything else, including
      // a body that isn't JSON (the parser leaves it {}), can't be restored.
      const body = req.body as Record<string, unknown>;
      if (body?.format !== "dashboard-export") throw new BadRequest(COULDNT);
      if (body.version !== 1) throw new BadRequest("This download is from a different version of the app.");
      const parsed = envelope.safeParse(body);
      if (!parsed.success) throw new BadRequest(COULDNT);
      const user = await findUserById(req.userId);
      if (!user || user.email.toLowerCase() !== parsed.data.account.email.toLowerCase()) {
        throw new BadRequest("This download belongs to another account.");
      }
      const added = await restoreUserData(req.userId, parsed.data.tables, { dryRun });
      res.set("Cache-Control", "no-store").json({ added });
    } catch (err) {
      next(isDataError(err) ? new BadRequest(COULDNT) : err);
    }
  };
}

// Preview runs the identical restore and rolls back, so its numbers are what
// the restore will do.
restoreRouter.post("/preview", restoreRoute(true));
restoreRouter.post("/", restoreRoute(false));

/**
 * body-parser's own failures (bad JSON, too large, and broken gzip, which
 * arrives as zlib's error with only a status) are 4xx errors that aren't ours.
 * They are the file's fault, not the server's, so they answer like any file
 * that can't be restored rather than as a 500.
 */
const parserErrors: ErrorRequestHandler = (err, _req, _res, next) => {
  const status = (err as { status?: unknown })?.status;
  const fromParser = !(err instanceof AppError) && typeof status === "number" && status >= 400 && status < 500;
  next(fromParser ? new BadRequest(COULDNT) : err);
};
restoreRouter.use(parserErrors);
