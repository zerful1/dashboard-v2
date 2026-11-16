import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        {...rest}
        className={cn(
          "w-full rounded-xl bg-surface border border-edge px-3 py-2.5",
          "text-sm text-text placeholder:text-dim",
          // The hidden-outline utility, not the none variant, for the forced-colors fallback (see Button).
          "focus:outline-hidden focus:border-accent",
          "aria-[invalid=true]:border-negative",
          className,
        )}
      />
    );
  },
);
