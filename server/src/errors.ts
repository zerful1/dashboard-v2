/**
 * Errors the API raises deliberately. Anything else reaching the error handler is
 * a bug, and is reported as a generic 500 with no internal detail.
 */
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

/**
 * Also returned for rows that exist but belong to someone else. A 403 would confirm
 * the row's existence, which leaks information across accounts.
 */
export class NotFound extends AppError {
  constructor(message = "Not found") {
    super(404, message, "not_found");
  }
}

export class Conflict extends AppError {
  constructor(message = "Already exists") {
    super(409, message, "conflict");
  }
}
