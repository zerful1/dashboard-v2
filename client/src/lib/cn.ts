import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge reads any text-* class it doesn't know as a colour, so
// `text-label` (the app's own font size, styles.css) was dropped whenever a
// text colour sat beside it. Declaring it a font size keeps both.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-label"] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
