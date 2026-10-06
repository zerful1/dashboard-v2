import { cloneElement, isValidElement, type AriaAttributes, type ReactNode } from "react";

interface Props {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Wraps a control with its label, hint and error, and wires the ARIA
 * association onto the child itself — `aria-describedby` points at whichever
 * of the error or hint text is currently showing (error wins), and
 * `aria-invalid` is set for the duration of an error — so every field is
 * correct by construction rather than each page having to remember to wire
 * it up by hand. Colour is never the only signal that something is wrong:
 * the announced description is.
 */
export function Field({ label, htmlFor, error, hint, children }: Props) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const ownDescribedBy = error ? errorId : hint ? hintId : undefined;

  // isValidElement is the guard: Field is also used to wrap a plain <div> of
  // a button group, not just single inputs. `aria-describedby`/`aria-invalid`
  // are valid on almost anything, so cloning is harmless there too — but
  // strings, numbers, and arrays of children aren't elements at all, and get
  // passed through untouched rather than fed to cloneElement.
  const child = isValidElement<AriaAttributes>(children)
    ? cloneElement(children, {
        // aria-describedby is a space-separated id list by spec — append
        // rather than replace, so a caller's own value is never clobbered.
        "aria-describedby":
          [children.props["aria-describedby"], ownDescribedBy].filter(Boolean).join(" ") || undefined,
        // A boolean `true`/`undefined`, never the string "false": an absent
        // attribute is the correct way to say "valid", and Input's
        // `aria-[invalid=true]:border-negative` selector keys on the string
        // "true", so a bare boolean true is what turns it on.
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
