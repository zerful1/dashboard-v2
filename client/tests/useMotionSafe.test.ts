import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const reducedMotion = vi.hoisted(() => ({ value: false as boolean | null }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => reducedMotion.value,
}));

const { useMotionSafe } = await import("../src/lib/motion");

/** The link between the OS preference and the boolean every animated component branches on. */
describe("useMotionSafe", () => {
  beforeEach(() => {
    reducedMotion.value = false;
  });

  it("is true when the OS has no reduced-motion preference", () => {
    reducedMotion.value = false;
    expect(renderHook(() => useMotionSafe()).result.current).toBe(true);
  });

  it("is FALSE when the OS asks for reduced motion", () => {
    // The case that matters: Sheet, WeightHeadline and the Home card read this.
    reducedMotion.value = true;
    expect(renderHook(() => useMotionSafe()).result.current).toBe(false);
  });

  it("treats an undetermined preference as motion-safe", () => {
    // useReducedMotion returns null before the media query resolves.
    reducedMotion.value = null;
    expect(renderHook(() => useMotionSafe()).result.current).toBe(true);
  });
});
