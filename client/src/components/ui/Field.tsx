import type { ReactNode } from "react";

interface Props {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Wraps a control with its label and error. The error is `role="alert"` and tied
 * to the input by aria-describedby, so screen readers announce it — colour alone
 * is never the only signal that something is wrong.
 */
export function Field({ label, htmlFor, error, hint, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="lbl block">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-dim">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
