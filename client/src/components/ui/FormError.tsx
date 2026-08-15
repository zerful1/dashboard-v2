import type { ReactNode } from "react";

/**
 * The inline half of the client's two error mechanisms: a form submission
 * renders its own error next to its controls, and everything else toasts (the
 * whole rule is in App.tsx). This is the banner for a submission that failed
 * as a whole — a field that failed on its own belongs in `Field`'s `error`.
 *
 * `role="alert"` because the banner appears without the user moving focus, and
 * a second identical failure re-announces rather than passing in silence.
 *
 * Only the banner is shared. Each auth page keeps its own submit handler even
 * though all four look alike: ForgotPasswordPage deliberately reports success
 * whatever happens, so that it cannot be used to test whether an address has an
 * account, and folding the four into one hook would turn that defence into a
 * flag — something a contributor could switch off without ever seeing why it
 * was on.
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative"
    >
      {children}
    </p>
  );
}
