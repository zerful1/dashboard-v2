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

  // Unexpected: log server-side, tell the client nothing useful. Leaking a stack
  // trace or a database message is how schema details escape into the wild.
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "internal_error",
    message: config.isProduction ? "Something went wrong" : String(err),
  });
};
