import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        {...rest}
        className={cn(
          "w-full rounded-lg bg-surface border border-raised px-3 py-2.5",
          "text-sm text-text placeholder:text-dim",
          "focus:outline-none focus:border-accent",
          "aria-[invalid=true]:border-negative",
          className,
        )}
      />
    );
  },
);
