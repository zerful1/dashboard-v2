import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "selected" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // Terracotta marks exactly three roles and nothing else (see the accent token
  // in styles.css). Two of them are here: filled is "the one action to take" —
  // at most one per screen, and it is nearly always this variant.
  primary: "bg-accent text-bg hover:brightness-110 active:brightness-95",
  // Tinted is "the currently selected item in a set" — a state, not an action.
  // Identical to the active nav item in NavRail deliberately: one tint means
  // one thing everywhere. Filling a selected item instead makes it shout as
  // loudly as the primary action while meaning the opposite.
  selected: "bg-accent/10 text-accent",
  ghost: "bg-surface text-text border border-raised hover:bg-raised",
  // Filled rather than coloured text: destructive actions must not rely on hue
  // alone to distinguish themselves from the terracotta accent.
  danger: "bg-negative/15 text-negative border border-negative/40 hover:bg-negative/25",
};

export function Button({ variant = "primary", loading, disabled, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5",
        "text-sm font-semibold transition",
        // outline-hidden (not outline-none): both suppress the native outline so the
        // ring below is the only indicator in normal rendering, but outline-hidden
        // keeps a forced-colors-mode fallback outline — needed here because the ring
        // is a box-shadow, which forced-colors mode does not paint at all.
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:opacity-50 disabled:pointer-events-none",
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
