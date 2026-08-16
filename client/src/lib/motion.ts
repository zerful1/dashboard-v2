import { useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";

/**
 * Three transitions, used everywhere. Naming them stops every component
 * inventing its own duration and the interface reading as several systems at
 * once — the same reasoning that makes the colour tokens role-named rather than
 * a palette of hexes chosen per component.
 *
 * Imports come from `motion/react`. The package was formerly `framer-motion`
 * and that name is retired; `motion/react` is the current entry point.
 */
export const TRANSITIONS = {
  /** Presses, toggles, hovers. Fast enough to feel like a direct response. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Sheets and panels. Enough travel to read as a surface arriving. */
  smooth: { type: "spring", stiffness: 300, damping: 32, mass: 0.9 },
  /** Layout shifts in lists — deliberately the slowest, so rows are trackable. */
  gentle: { type: "spring", stiffness: 210, damping: 30, mass: 1 },
} as const satisfies Record<string, Transition>;

/**
 * False when the OS asks for reduced motion.
 *
 * This is an accessibility requirement, not a preference: vestibular disorders
 * make large transforms genuinely unpleasant, and a sheet that slides or a list
 * that reflows can trigger it. Every animated component in this app branches on
 * this — there is no animation that ignores it.
 */
export function useMotionSafe(): boolean {
  return !useReducedMotion();
}

/**
 * A transition, or an instant one when reduced motion is requested.
 *
 * Duration 0 rather than removing the prop: state still changes and layout
 * still settles, it simply arrives immediately. Stripping the animation
 * entirely tends to break `layout` measurements, which is how "respecting
 * reduced motion" turns into "the list jumps to the wrong height".
 */
export function springOrNone(t: Transition, safe: boolean): Transition {
  return safe ? t : { duration: 0 };
}
