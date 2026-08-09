import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { BadRequest } from "../errors";

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Validate request parts at the route boundary, so handlers can trust their input.
 *
 * On success the raw value is replaced with the parsed one, so downstream code sees
 * coercions, defaults and trimming rather than whatever arrived on the wire.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ["body", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const details: Record<string, string> = {};
        for (const issue of result.error.issues) {
          details[issue.path.join(".") || key] = issue.message;
        }
        next(new BadRequest("Validation failed", details));
        return;
      }

      // defineProperty rather than assignment: Express 4 defines req.query as a
      // getter-only property, so `req.query = ...` silently fails in strict mode.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
