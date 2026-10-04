import { useAuth } from "@/auth/AuthProvider";

/** The read-only demo says so on every screen, with a way out. */
export function DemoBanner() {
  const { user, logout } = useAuth();
  if (!user?.demo) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-raised bg-surface px-4 py-1.5 text-xs text-muted">
      <span>Demo · browse freely, changes aren&apos;t saved</span>
      <button type="button" onClick={() => void logout()} className="text-text underline underline-offset-4">
        Leave demo
      </button>
    </div>
  );
}
