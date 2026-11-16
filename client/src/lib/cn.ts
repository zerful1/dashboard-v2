import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge reads unknown text-* as a colour and drops `text-label`, so declare it a font size.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-label"] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
