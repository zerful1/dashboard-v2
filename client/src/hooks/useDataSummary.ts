import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { exportApi } from "@/api/export";

/** Settings' line beside the download. Its absence is the failure state, so no toast. */
export function useDataSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dataSummary", user?.id ?? "anon"],
    queryFn: exportApi.summary,
    enabled: !!user,
    meta: { errorToast: false },
  });
}
