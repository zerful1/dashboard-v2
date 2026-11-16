/** Errors the API raises deliberately; anything else reaching the handler is a bug, reported as a bare 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequest extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super(400, message, "bad_request", details);
  }
}

export class Unauthorized extends AppError {
  constructor(message = "Not authenticated") {
    super(401, message, "unauthorized");
  }
}

/** Also for rows owned by someone else: a 403 would confirm the row exists. */
export class NotFound extends AppError {
  constructor(message = "Not found") {
    super(404, message, "not_found");
  }
}

/** A policy refusal that reveals nothing about any account (closed sign-ups); never for someone else's row. */
export class Forbidden extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "forbidden");
  }
}

export class Conflict extends AppError {
  constructor(message = "Already exists") {
    super(409, message, "conflict");
  }
}

/** A caller past a rate limit (middleware/rateLimit.ts). The handler sets Retry-After. */
export class TooManyRequests extends AppError {
  constructor(message = "Too many attempts. Try again in a few minutes.") {
    super(429, message, "too_many_requests");
  }
}
