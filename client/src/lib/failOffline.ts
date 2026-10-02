/**
 * Spread into a useMutation so a write made offline FAILS instead of waiting.
 *
 * CLAUDE.md: writes are not queued offline - logging with no signal fails with
 * a toast. TanStack's default networkMode, "online", does the opposite: it
 * pauses the mutation while offline and replays it on reconnect, so the
 * optimistic row looks saved, and closing the app before the signal returns
 * loses it. "always" sends the request regardless, the fetch fails, the
 * optimistic write rolls back and App.tsx's handler shows the toast.
 */
export const failOffline = { networkMode: "always" } as const;
