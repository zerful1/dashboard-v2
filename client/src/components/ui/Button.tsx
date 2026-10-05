import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "selected" | "ghost" | "subtle" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // White is the only accent (see the accent token in styles.css). Two of its
  // roles are here: a filled white pill is "the one action to take" — at most
  // one per screen, and it is nearly always this variant.
  primary: "bg-accent text-bg hover:brightness-90 active:brightness-75",
  // Tinted is "the currently selected item in a set" — a state, not an action.
  // Identical to the active nav item in NavRail deliberately: one tint means
  // one thing everywhere. Filling a selected item instead makes it shout as
  // loudly as the primary action while meaning the opposite.
  selected: "bg-accent/10 text-accent",
  // Any other action: an outline, so it is plainly a button without competing
  // with the one filled pill.
  ghost: "border border-edge text-text hover:bg-accent/5",
  // Dismiss, and the unchosen items of a set (beside `selected`).
  subtle: "text-muted hover:text-text",
  // A red tint, so a destructive action is told apart by fill as well as hue.
  danger: "bg-negative/12 text-negative hover:bg-negative/20",
};

export function Button({ variant = "primary", loading, disabled, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5",
        "text-sm font-semibold transition",
        // outline-hidden (not outline-none): both suppress the native outline so the
        // ring below is the only indicator in normal rendering, but outline-hidden
        // keeps a forced-colors-mode fallback outline — needed here because the ring
        // is a box-shadow, which forced-colors mode does not paint at all.
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        // Dark grey, not a faded white: a disabled primary must not read as the action.
        "disabled:pointer-events-none disabled:border-transparent disabled:bg-raised disabled:text-dim",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
