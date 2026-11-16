import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors";
import { config } from "../config";

/** Single exit point for every error, so the response shape stays consistent. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Bad body from express.json(): a 4xx, never logged whole (err.body holds raw text, a password on /login).
  if (isClientError(err)) {
    const [error, message] = CLIENT_ERRORS[err.status] ?? ["bad_request", "Malformed request body"];
    res.status(err.status).json({ error, message });
    return;
  }

  // Postgres refusing a value is a 4xx; logged by code alone, since its message quotes the user's data.
  const refused = dataErrorCode(err);
  if (refused) {
    console.error(`Postgres refused a value (${refused}) that validation let through`);
    if (refused === "23505") res.status(409).json({ error: "conflict", message: "Already exists" });
    else res.status(400).json({ error: "bad_request", message: "That can't be saved as it is" });
    return;
  }

  // Unexpected: log server-side; a stack trace or database message must not reach the client.
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

/** The SQLSTATE of a pg error in class 22 or 23, else null; `severity` tells a pg error from other coded ones. */
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
