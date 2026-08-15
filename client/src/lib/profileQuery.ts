import type { Profile } from "@dashboard/shared";
import { api } from "./api";

/**
 * The one description of how the profile is fetched.
 *
 * Home and Settings both read it, and TanStack Query keys the cache by
 * `queryKey` alone — so two observers on the same key with different options
 * are one query whose behaviour depends on which mounted last. Sharing this
 * object makes that impossible rather than merely unlikely.
 *
 * `errorToast: false` because both callers already handle a failure themselves:
 * Settings renders an error card with a retry, Home falls back to the email.
 * The global toast would be a second message for the same failure.
 */
export const profileQuery = {
  queryKey: ["profile"] as const,
  queryFn: () => api<Profile>("/api/profile"),
  meta: { errorToast: false },
};
