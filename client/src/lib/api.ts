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

/** How long a request waits for the server to start answering; dead wifi would otherwise spin forever. */
export const API_TIMEOUT_MS = 15_000;

/** The only fetch call; credentials 'include' sends the cookie, and only the wait for the answer to start is timed. */
export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  // Our own controller so the timer can abort; the caller's signal is forwarded by hand (no AbortSignal.any on old iOS).
  const controller = new AbortController();
  const caller = options?.signal;
  const forward = () => controller.abort(caller?.reason);
  if (caller?.aborted) forward();
  else caller?.addEventListener("abort", forward);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(path, {
        ...options,
        signal: controller.signal,
        credentials: "include",
        headers: {
          ...(!(options?.body instanceof FormData) && { "Content-Type": "application/json" }),
          ...options?.headers,
        },
      });
    } catch (err) {
      if (timedOut) throw new ApiError(0, "Timed out", "timeout");
      throw err;
    } finally {
      clearTimeout(timer);
    }
    return await read<T>(res);
  } finally {
    caller?.removeEventListener("abort", forward);
  }
}

/** The answer's JSON, or the ApiError it describes. */
async function read<T>(res: Response): Promise<T> {
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
