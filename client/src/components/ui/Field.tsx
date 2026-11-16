import { cloneElement, isValidElement, type AriaAttributes, type ReactNode } from "react";

interface Props {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Wraps a control with its label, hint and error, wiring aria-describedby (error wins) and aria-invalid. */
export function Field({ label, htmlFor, error, hint, children }: Props) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const ownDescribedBy = error ? errorId : hint ? hintId : undefined;

  // isValidElement guards a plain <div> or non-element children, which pass through untouched.
  const child = isValidElement<AriaAttributes>(children)
    ? cloneElement(children, {
        // aria-describedby is a space-separated id list: append, never clobber a caller's value.
        "aria-describedby":
          [children.props["aria-describedby"], ownDescribedBy].filter(Boolean).join(" ") || undefined,
        // A boolean true or undefined, never "false": Input's `aria-[invalid=true]` selector keys on it.
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="lbl block">
        {label}
      </label>
      {child}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
