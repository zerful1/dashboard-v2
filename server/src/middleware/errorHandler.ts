import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors";
import { config } from "../config";

/**
 * Single exit point for every error. Routes call next(err) and never format their
 * own error responses, so the shape stays consistent across the whole API.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // The client's own fault, raised before any route ran: express.json() rejecting
  // a malformed or oversized body. Answered as a 4xx, and never logged whole —
  // body-parser keeps the raw text on `err.body`, and on /login that is a password.
  if (isClientError(err)) {
    const [error, message] = CLIENT_ERRORS[err.status] ?? ["bad_request", "Malformed request body"];
    res.status(err.status).json({ error, message });
    return;
  }

  // Postgres refusing a VALUE: a date that doesn't exist, a number out of a
  // column's range, a row a constraint won't take. The request asked for
  // something the data can't hold, so it is a 4xx, not this server failing.
  // A net under the validators, not a replacement for one: reaching here means
  // a schema let something through, so it is still logged, by code alone -
  // Postgres quotes the offending value in its message, and that is the
  // user's data. The client is told nothing the database said.
  const refused = dataErrorCode(err);
  if (refused) {
    console.error(`Postgres refused a value (${refused}) that validation let through`);
    if (refused === "23505") res.status(409).json({ error: "conflict", message: "Already exists" });
    else res.status(400).json({ error: "bad_request", message: "That can't be saved as it is" });
    return;
  }

  // Unexpected: log server-side, tell the client nothing useful. Leaking a stack
  // trace or a database message is how schema details escape into the wild.
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "internal_error",
    message: config.isProduction ? "Something went wrong" : String(err),
  });
};

/** body-parser's statuses other than 400. */
const CLIENT_ERRORS: Record<number, [string, string]> = {
  413: ["payload_too_large", "Request body too large"],
  415: ["unsupported_media_type", "Unsupported body encoding"],
};

/**
 * The SQLSTATE of a pg error in class 22 (data exception) or 23 (integrity
 * constraint violation), else null. `severity` tells a pg error from anything
 * else that happens to carry a five-character `code`.
 */
function dataErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const { code, severity } = err as { code?: unknown; severity?: unknown };
  return typeof code === "string" && typeof severity === "string" && /^2[23][0-9A-Z]{3}$/.test(code) ? code : null;
}

/** An http-errors 4xx marked safe to show the client, as body-parser raises. */
function isClientError(err: unknown): err is { status: number } {
  if (typeof err !== "object" || err === null) return false;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === "number" && status >= 400 && status < 500 && expose === true;
}
