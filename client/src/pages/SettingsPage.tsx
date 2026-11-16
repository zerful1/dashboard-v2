import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PASSWORD_MIN_LENGTH, type Profile } from "@dashboard/shared";
import { api } from "@/lib/api";
import { profileQuery } from "@/lib/profileQuery";
import { useAuth } from "@/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { YourDataCard } from "@/features/settings/YourDataCard";
import { ShortcutList } from "@/features/settings/ShortcutList";
import { AppSection } from "@/features/settings/AppSection";
import { useToday } from "@/hooks/useToday";

/** Resolves `tz` to its canonical IANA name or null, so a typo fails here, not later in Postgres. */
function normalizeTimeZone(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Nothing here is a submission, so failures toast via the MutationCache; the profile query renders its own error. */
export function SettingsPage() {
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  // One clock for the page (CLAUDE.md).
  const today = useToday();

  const {
    data: profile,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery(profileQuery);

  const saveProfile = useMutation({
    // Narrower than Partial<Profile> on purpose: a call passing user_id or updated_at should fail here.
    mutationFn: (patch: Pick<Profile, "timezone">) =>
      api<Profile>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (updated) => {
      qc.setQueryData(["profile"], updated);
      toast.success("Saved");
    },
  });

  // Uncommitted autosave-on-blur text; cleared from mutateAsync's promise, as a second blur detaches `.mutate()` callbacks.
  const [tzDraft, setTzDraft] = useState<string | null>(null);
  const [tzError, setTzError] = useState<string | undefined>(undefined);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [deletePw, setDeletePw] = useState("");

  const changePassword = useMutation({
    mutationFn: () =>
      api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Password changed — other devices signed out");
    },
  });

  const deleteAccount = useMutation({
    mutationFn: () =>
      api("/api/profile", { method: "DELETE", body: JSON.stringify({ password: deletePw }) }),
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  // Before the spinner: an errored v5 query has isLoading false and no data, so it would spin forever.
  if (isError) {
    return (
      <div className="max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div>
          <p role="alert" className="text-sm leading-relaxed text-negative">
            We couldn&apos;t load your profile. The server may still be waking up.
          </p>
          <Button variant="ghost" className="mt-2" onClick={() => void refetch()} loading={isFetching}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !profile) return <Spinner label="Loading your profile" />;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <ShortcutList today={today} />

      <YourDataCard />

      <Card className="space-y-4">
        <h2 className="lbl">Password</h2>
        <Field label="Current password" htmlFor="current">
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="next"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Button
          onClick={() => changePassword.mutate()}
          loading={changePassword.isPending}
          // The gate and hint read the same constant as the server's schema, so they can't drift.
          disabled={!current || next.length < PASSWORD_MIN_LENGTH}
        >
          Change password
        </Button>
      </Card>

      <AppSection />

      <Card className="space-y-4">
        <h2 className="lbl">Account</h2>
        <p className="text-sm">{user?.email}</p>
        <Field
          label="Timezone"
          htmlFor="timezone"
          hint="Used to keep times right when you copy a day of food."
          error={tzError}
        >
          <Input
            id="timezone"
            value={tzDraft ?? profile.timezone}
            onChange={(e) => {
              setTzDraft(e.target.value);
              if (tzError) setTzError(undefined);
            }}
            onBlur={(e) => {
              const typed = e.target.value.trim();
              if (typed === profile.timezone) {
                setTzDraft(null);
                return;
              }
              const canonical = normalizeTimeZone(typed);
              if (!canonical) {
                setTzError("Not a recognized timezone — try a name like Europe/Warsaw.");
                return;
              }
              setTzError(undefined);
              void saveProfile
                .mutateAsync({ timezone: canonical })
                .catch(() => {})
                .finally(() => setTzDraft(null));
            }}
          />
        </Field>
        <Button variant="ghost" onClick={() => void logout()} className="w-full">
          Sign out
        </Button>
        {/* The password proves identity; the confirm below prevents a slip.
            They answer different questions, so both stay. Without this, anyone
            at an unlocked device could erase the account with one click. */}
        <Field label="Confirm with your password" htmlFor="delete-pw">
          <Input
            id="delete-pw"
            type="password"
            autoComplete="current-password"
            value={deletePw}
            onChange={(e) => setDeletePw(e.target.value)}
          />
        </Field>
        <Button
          variant="danger"
          className="w-full"
          loading={deleteAccount.isPending}
          disabled={!deletePw}
          onClick={() => {
            // A native confirm on purpose: it cascades through every table the account owns.
            const ok = window.confirm(
              `Delete the account for ${user?.email ?? "this account"} and all its data? This cannot be undone.`,
            );
            if (ok) deleteAccount.mutate();
          }}
        >
          Delete account
        </Button>
      </Card>
    </div>
  );
}
