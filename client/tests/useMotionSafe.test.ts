import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const reducedMotion = vi.hoisted(() => ({ value: false as boolean | null }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => reducedMotion.value,
}));

const { useMotionSafe } = await import("../src/lib/motion");

/**
 * The link between the OS preference and the boolean every animated component
 * branches on. `springOrNone` is tested separately; this is the other half —
 * without it, a correct springOrNone could still be fed a constant.
 */
describe("useMotionSafe", () => {
  beforeEach(() => {
    reducedMotion.value = false;
  });

  it("is true when the OS has no reduced-motion preference", () => {
    reducedMotion.value = false;
    expect(renderHook(() => useMotionSafe()).result.current).toBe(true);
  });

  it("is FALSE when the OS asks for reduced motion", () => {
    // The case that matters. Sheet reads this to decide drag={safe ? "y" : false},
    // WeightList to decide whether rows animate their height, and the Home card
    // to decide whether it lifts on hover. If this ever returned true here, all
    // three would animate against an explicit accessibility request.
    reducedMotion.value = true;
    expect(renderHook(() => useMotionSafe()).result.current).toBe(false);
  });

  it("treats an undetermined preference as motion-safe", () => {
    // useReducedMotion returns null before the media query resolves. Defaulting
    // to safe keeps the first paint animated rather than flashing static then
    // moving, and the value corrects itself once it resolves.
    reducedMotion.value = null;
    expect(renderHook(() => useMotionSafe()).result.current).toBe(true);
  });
});
