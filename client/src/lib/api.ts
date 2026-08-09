export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The only place fetch is called.
 *
 * `credentials: 'include'` is what makes the session cookie travel; without it
 * every authenticated request silently 401s.
 */
export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(!(options?.body instanceof FormData) && { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let message = "Something went wrong";
    let code: string | undefined;
    let details: Record<string, string> | undefined;
    try {
      const body = await res.json();
      message = body.message ?? message;
      code = body.error;
      details = body.details;
    } catch {
      // Not JSON — an HTML error page or an empty body. Keep the default message.
    }
    throw new ApiError(res.status, message, code, details);
  }

  // 204 and other empty bodies are normal (logout, delete, password change).
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
