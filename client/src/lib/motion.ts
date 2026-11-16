import { useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";

/** Three transitions used everywhere, so components don't invent their own durations. */
export const TRANSITIONS = {
  /** Presses, toggles, hovers. Fast enough to feel like a direct response. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Sheets and panels. Enough travel to read as a surface arriving. */
  smooth: { type: "spring", stiffness: 300, damping: 32, mass: 0.9 },
  /** Layout shifts in lists — deliberately the slowest, so rows are trackable. */
  gentle: { type: "spring", stiffness: 210, damping: 30, mass: 1 },
} as const satisfies Record<string, Transition>;

/** False when the OS asks for reduced motion; every animated component branches on it. */
export function useMotionSafe(): boolean {
  return !useReducedMotion();
}

/** A transition, or an instant one for reduced motion: duration 0 keeps `layout` measurements working. */
export function springOrNone(t: Transition, safe: boolean): Transition {
  return safe ? t : { duration: 0 };
}
