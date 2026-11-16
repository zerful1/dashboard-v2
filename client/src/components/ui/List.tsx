import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Rows between hairlines, no box; rows bring vertical padding, the dividers are this container's. */
export function List({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("divide-y divide-raised border-y border-raised", className)} />;
}
