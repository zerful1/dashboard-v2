import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Rows separated by hairlines, with no box around them (redesign spec §5.4).
 * Rows bring their own vertical padding and no side padding, so they line up
 * with the page title; the dividers are this container's, so rows carry no
 * borders of their own.
 */
export function List({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("divide-y divide-raised border-y border-raised", className)} />;
}
