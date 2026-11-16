import type { Profile } from "@dashboard/shared";
import { api } from "./api";

/** The one profile fetch, shared by Home and Settings so one key never has two behaviours; both render their own failure. */
export const profileQuery = {
  queryKey: ["profile"] as const,
  queryFn: () => api<Profile>("/api/profile"),
  meta: { errorToast: false },
};
