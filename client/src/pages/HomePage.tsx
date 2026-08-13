import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui/Card";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Overview</div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">
          {user?.email}
        </h1>
      </div>

      <Card>
        <div className="lbl">Nothing here yet</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Gym, nutrition, habits and media arrive in the next phases. Your account
          and profile are live now — try <span className="text-accent">Settings</span>.
        </p>
      </Card>
    </div>
  );
}
