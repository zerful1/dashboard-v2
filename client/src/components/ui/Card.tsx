import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** A section: content under a hairline, aligned to the page edge; the design has no boxes. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("border-t border-raised py-4", className)} />;
}
