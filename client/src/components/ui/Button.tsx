import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "selected" | "ghost" | "subtle" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // White is the only accent: a filled white pill is the one action to take, at most one per screen.
  primary: "bg-accent text-bg hover:brightness-90 active:brightness-75",
  // Tinted is the selected item in a set, identical to the active NavRail item: a state, not an action.
  selected: "bg-accent/10 text-accent",
  // Any other action: an outline, so it doesn't compete with the one filled pill.
  ghost: "border border-edge text-text hover:bg-accent/5",
  // Dismiss and unchosen set items; no fill even when disabled, as a grey pill would pass for selected.
  subtle: "text-muted hover:text-text disabled:bg-transparent",
  // A red tint, so a destructive action is told apart by fill as well as hue.
  danger: "bg-negative/12 text-negative hover:bg-negative/20",
};

/** Button's look for a Link that should read as one; one source, so changes reach both. */
export function buttonClass(variant: Variant = "primary", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5",
    "text-sm font-semibold transition",
    // outline-hidden, not outline-none: it keeps a forced-colors outline, where the box-shadow ring isn't painted.
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    // Dark grey, not a faded white: a disabled primary must not read as the action.
    "disabled:pointer-events-none disabled:border-transparent disabled:bg-raised disabled:text-dim",
    VARIANTS[variant],
    className,
  );
}

export function Button({ variant = "primary", loading, disabled, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, className)}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
