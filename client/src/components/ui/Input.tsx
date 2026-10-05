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
          // The hidden-outline utility, not the none variant — same reason it
          // is used on Button, spelled out there: only one of the two keeps a
          // fallback outline in forced-colors mode, where the border this
          // relies on instead may not be painted as written.
          "focus:outline-hidden focus:border-accent",
          "aria-[invalid=true]:border-negative",
          className,
        )}
      />
    );
  },
);
