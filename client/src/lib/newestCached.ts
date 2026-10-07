import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * The newest cached answer under `prefix`, for a query whose key ends in a
 * date. Every new day is a new key with nothing cached, so offline it waits
 * for the network behind a spinner while yesterday's answer sits in the cache.
 * Used as `placeholderData`, that answer stands in until today's arrives.
 *
 * `prefix` must carry the user id: the query keys are scoped by it, and this
 * is what keeps another account's answer from standing in.
 */
export function newestCached<T>(qc: QueryClient, prefix: QueryKey): T | undefined {
  let newest: { day: string; data: T } | undefined;
  for (const [key, data] of qc.getQueriesData<T>({ queryKey: prefix })) {
    // ISO dates, so the greatest string is the newest day.
    const day = String(key[key.length - 1]);
    if (data !== undefined && (!newest || day > newest.day)) newest = { day, data };
  }
  return newest?.data;
}
