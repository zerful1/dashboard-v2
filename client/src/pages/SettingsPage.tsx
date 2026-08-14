import { Card } from "@/components/ui/Card";

/**
 * Placeholder. Task 10 replaces this wholesale with real account settings —
 * this exists only so the /settings route resolves and the app builds.
 */
export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Account</div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">Settings</h1>
      </div>

      <Card>
        <p className="text-sm leading-relaxed text-muted">Settings are on their way.</p>
      </Card>
    </div>
  );
}
