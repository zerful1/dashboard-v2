import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { gymApi } from "@/api/gym";

export function useSessionDetail(sessionId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sessionDetail", user?.id ?? "anon", sessionId],
    queryFn: () => gymApi.sessionDetail(sessionId!),
    enabled: !!user && !!sessionId,
    staleTime: 60_000,
  });
}
