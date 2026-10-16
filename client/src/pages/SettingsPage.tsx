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

/**
 * Resolves `tz` to its canonical IANA name (folds case, resolves an alias
 * like "GMT" to "UTC"), or returns `null` if `Intl` doesn't recognize it as a
 * zone at all.
 *
 * The server's own check (`patchBody` in server/src/routes/profile.ts) is
 * deliberately permissive — any non-empty string up to 60 characters is
 * accepted, and a bad value is only ever rejected where it's actually handed
 * to a timezone parser. Food's copy-a-day hands it to Postgres (`AT TIME
 * ZONE`), which rejects an unknown zone, so a typo saved here would surface
 * there, far from this field. Running the same check at the point the value
 * is typed is what turns that distant failure into an immediate, honest one.
 */
function normalizeTimeZone(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * How this page reports failure, and the rule behind it (the whole rule is in
 * lib/queryClient.ts): a form submission renders its own inline error;
 * everything else toasts. Nothing here is a submission — the timezone field
 * autosaves on blur, after the user has already moved on, and there is no
 * submit button to anchor a message to — so none of the mutations render
 * error UI. Each rejection is left to the app-wide toast, which sits on the
 * MutationCache and so fires whether or not a mutation has its own onError.
 *
 * The profile query is the exception, because this page cannot render at all
 * without it: it renders its own error state below and opts out of the toast,
 * so one failure never reports itself twice.
 */
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
    // Narrower than Partial<Profile> on purpose: the timezone is the one
    // field this page sets, so a call passing user_id or updated_at should
    // fail here rather than 400 there.
    mutationFn: (patch: Pick<Profile, "timezone">) =>
      api<Profile>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (updated) => {
      qc.setQueryData(["profile"], updated);
      toast.success("Saved");
    },
  });

  // Local, uncommitted text for the autosave-on-blur field below. `null`
  // means "no edit in flight" — the field just mirrors `profile`. Set while
  // the user types; cleared once their own save attempt concludes, whichever
  // way: a blur with no real change, a successful save, or a failed one.
  // Clearing on failure too is what keeps the field honest — without it, an
  // uncontrolled `defaultValue` input would go on showing what the user typed
  // after a failed save even though the server still has the old value, with
  // only an easy-to-miss toast saying otherwise.
  //
  // Cleared from the promise `mutateAsync` returns rather than an `onSettled`
  // passed to `.mutate()`: if one save is still in flight when the next blur
  // starts a second, that second call detaches the first call's observer — an `onSettled` passed to
  // `.mutate()` for the first call would then silently never run. The
  // returned promise itself still settles correctly either way.
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

  // Before the spinner, not after it. A settled-with-error query in v5 has
  // isLoading false and data undefined, so `isLoading || !profile` catches it
  // and spins forever — a page that says "loading" about something that has
  // already stopped. The database this reads through pauses when idle, which
  // is exactly this case, and it is recoverable, so it gets a retry.
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
          // The gate and the hint above read the same constant as the server's
          // schema. A button that let through what the server rejects — or held
          // back what it would have accepted — is the drift this prevents.
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
            // A native confirm, not a custom modal, deliberately: this
            // cascades through every table the account owns. Blunt, but
            // proportionate for a personal tracker with a handful of users —
            // and the button it guards already reads as destructive on its
            // own (filled `danger`, not just red text) rather than leaning on
            // this dialog alone to carry that signal.
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
