import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGymDay } from "../src/hooks/useGymDay";
import { DEFAULT_SPLIT } from "@dashboard/shared";

// DEFAULT_SPLIT week is Monday-first: [3, 2, 1, 'rest', 5, 4, 'rest']
// Mon=Push(3) Tue=Pull(2) Wed=Legs(1) Thu=rest Fri=Upper(5) Sat=Lower(4) Sun=rest
const A_WEDNESDAY = new Date(2026, 7, 12); // 12 Aug 2026
const A_THURSDAY = new Date(2026, 7, 13); // rest day

afterEach(() => vi.useRealTimers());

function freeze(d: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(d);
}

describe("useGymDay", () => {
  it("selects today's rotation slot on a training day", () => {
    freeze(A_WEDNESDAY);
    const { result } = renderHook(() => useGymDay(DEFAULT_SPLIT, null));
    expect(result.current.dayType).toBe(1); // Wednesday = Legs
  });

  it("falls back to the last logged day on a rest day", () => {
    freeze(A_THURSDAY);
    const { result } = renderHook(() => useGymDay(DEFAULT_SPLIT, 5));
    expect(result.current.dayType).toBe(5);
  });

  it("does not sit on a stale default while the fallback is still loading", () => {
    freeze(A_THURSDAY);
    // undefined = query in flight. Something must render, so the first training
    // day stands in until the answer arrives.
    const { result, rerender } = renderHook(({ last }) => useGymDay(DEFAULT_SPLIT, last), {
      initialProps: { last: undefined as number | undefined },
    });
    expect(result.current.dayType).toBe(1); // split.days[0]

    rerender({ last: 4 });
    expect(result.current.dayType).toBe(4);
  });

  it("a user choice survives a later fallback resolving", () => {
    // v1's bug: the slow query overwrote a deliberate selection.
    freeze(A_THURSDAY);
    const { result, rerender } = renderHook(({ last }) => useGymDay(DEFAULT_SPLIT, last), {
      initialProps: { last: undefined as number | undefined },
    });

    act(() => result.current.selectDay(2));
    expect(result.current.dayType).toBe(2);

    rerender({ last: 5 });
    expect(result.current.dayType).toBe(2);
  });

  it("a user choice survives the split query landing", () => {
    freeze(A_WEDNESDAY);
    const { result, rerender } = renderHook(({ split }) => useGymDay(split, null), {
      initialProps: { split: DEFAULT_SPLIT },
    });

    act(() => result.current.selectDay(5));

    const custom = { ...DEFAULT_SPLIT, days: [...DEFAULT_SPLIT.days] };
    rerender({ split: custom });
    expect(result.current.dayType).toBe(5);
  });

  it("jumpTo sets both and locks out the fallback", () => {
    freeze(A_THURSDAY);
    const { result, rerender } = renderHook(({ last }) => useGymDay(DEFAULT_SPLIT, last), {
      initialProps: { last: undefined as number | undefined },
    });

    act(() => result.current.jumpTo(3, "2026-05-20"));
    expect(result.current.dayType).toBe(3);
    expect(result.current.date).toBe("2026-05-20");

    rerender({ last: 1 });
    expect(result.current.dayType).toBe(3);
  });

  it("defaults the date to today as a string", () => {
    freeze(A_WEDNESDAY);
    const { result } = renderHook(() => useGymDay(DEFAULT_SPLIT, null));
    expect(result.current.date).toBe("2026-08-12");
    expect(typeof result.current.date).toBe("string");
  });

  it("changing the date does not change the day", () => {
    freeze(A_WEDNESDAY);
    const { result } = renderHook(() => useGymDay(DEFAULT_SPLIT, null));
    act(() => result.current.selectDate("2026-08-05"));
    expect(result.current.dayType).toBe(1);
    expect(result.current.date).toBe("2026-08-05");
  });

  it("the rest-day fallback latches, so a later split change cannot undo it", () => {
    // The fallback sets the latch itself. Without that, a split refetch would
    // re-run the effect, find 'rest' again, and the branch would be stable —
    // but a split whose Thursday became a training day would yank the user off
    // the day they were already logging against.
    freeze(A_THURSDAY);
    const { result, rerender } = renderHook(({ split }) => useGymDay(split, 5), {
      initialProps: { split: DEFAULT_SPLIT },
    });
    expect(result.current.dayType).toBe(5);

    const thursdayIsLegs = { ...DEFAULT_SPLIT, week: [3, 2, 1, 1, 5, 4, "rest"] };
    rerender({ split: thursdayIsLegs as never });
    expect(result.current.dayType).toBe(5);
  });
});
