import type { ReactNode } from "react";

/** Inline banner for a failed submission; each auth page keeps its own handler so ForgotPassword's defence can't be flagged off. */
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
