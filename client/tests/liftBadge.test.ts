import { describe, it, expect } from "vitest";
import type { LiftProgress } from "@dashboard/shared";
import { liftBadge } from "../src/features/gym/stats/liftBadge";

const p = (over: Partial<LiftProgress>): LiftProgress => ({
  name: "Row", status: "stalled", best: null, change: null, weeksSinceBest: null, lastDate: "2026-10-01", ...over,
});

describe("liftBadge (redesign part 3b, §3)", () => {
  it("reads each status, in its signal colour", () => {
    expect(liftBadge(p({ status: "moving", change: 0.04 }))).toEqual({ text: "▲ 4%", tone: "good" });
    expect(liftBadge(p({ status: "moving", change: 0.004 }))).toEqual({ text: "▲ <1%", tone: "good" });
    expect(liftBadge(p({ status: "new" }))).toEqual({ text: "New", tone: "good" });
    expect(liftBadge(p({ status: "back", change: -0.06 }))).toEqual({ text: "▼ 6%", tone: "caution" });
    expect(liftBadge(p({ status: "stalled", weeksSinceBest: 7 }))).toEqual({ text: "No best in 7 wk", tone: "muted" });
    expect(liftBadge(p({ status: "stalled", weeksSinceBest: 0 }))).toEqual({ text: "No new best", tone: "muted" });
    expect(liftBadge(p({ status: "stalled", weeksSinceBest: null }))).toEqual({ text: "No best yet", tone: "muted" });
    expect(liftBadge(p({ status: "old" }))).toBeNull();
  });
});
