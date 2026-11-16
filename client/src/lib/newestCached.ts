import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** The newest cached answer under `prefix` for a date-ended key, as placeholderData; prefix must carry the user id. */
export function newestCached<T>(qc: QueryClient, prefix: QueryKey): T | undefined {
  let newest: { day: string; data: T } | undefined;
  for (const [key, data] of qc.getQueriesData<T>({ queryKey: prefix })) {
    // ISO dates, so the greatest string is the newest day.
    const day = String(key[key.length - 1]);
    if (data !== undefined && (!newest || day > newest.day)) newest = { day, data };
  }
  return newest?.data;
}
