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

/** An http-errors 4xx marked safe to show the client, as body-parser raises. */
function isClientError(err: unknown): err is { status: number } {
  if (typeof err !== "object" || err === null) return false;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === "number" && status >= 400 && status < 500 && expose === true;
}
