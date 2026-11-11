import { describe, it, expect } from "vitest";
import { STANDARD_PLATES_KG, buddyLoadFor, loadFor, stepFor } from "../src";

describe("loadFor", () => {
  it("loads 75 kg on a 20 kg machine as 25 + 2.5 a side", () => {
    expect(loadFor(20, 75, STANDARD_PLATES_KG)).toEqual({
      kind: "ok",
      perSideKg: 27.5,
      plates: [25, 2.5],
      loadedKg: 75,
      offByKg: 0,
    });
  });

  it("does not get stuck where greedy would: 45 a side from only 20s and 15s is 15 x 3", () => {
    // Greedy takes 20, 20 and is left needing 5, which does not exist.
    expect(loadFor(0, 90, [20, 15])).toEqual({
      kind: "ok",
      perSideKg: 45,
      plates: [15, 15, 15],
      loadedKg: 90,
      offByKg: 0,
    });
  });

  it("uses fewer plates than greedy would: 40 a side from 25, 20, 5 is 20 + 20", () => {
    // Greedy takes 25, then 5, 5, 5: four plates against two.
    const r = loadFor(0, 80, [25, 20, 5]);
    expect(r).toMatchObject({ plates: [20, 20], perSideKg: 40 });
  });

  it("breaks a tie on plate count toward the heavier plates: 30 a side is 20 + 10, not 15 + 15", () => {
    expect(loadFor(0, 60, [20, 15, 10])).toMatchObject({ plates: [20, 10], perSideKg: 30 });
  });

  it("with no plates at all when the total is exactly the machine", () => {
    expect(loadFor(20, 20, STANDARD_PLATES_KG)).toEqual({
      kind: "ok",
      perSideKg: 0,
      plates: [],
      loadedKg: 20,
      offByKg: 0,
    });
  });

  it("is 'below' when the total is under the machine", () => {
    expect(loadFor(20, 19.5, STANDARD_PLATES_KG)).toEqual({ kind: "below" });
  });

  it("treats a 0 kg start as no machine at all: 100 is 25 + 25 a side", () => {
    expect(loadFor(0, 100, STANDARD_PLATES_KG)).toMatchObject({ plates: [25, 25], perSideKg: 50 });
  });

  it("loads the nearest it can and reports how far under: 76 without the 25 and 1.25 loads 75", () => {
    const r = loadFor(20, 76, [20, 15, 10, 5, 2.5]);
    expect(r).toEqual({
      kind: "ok",
      perSideKg: 27.5,
      plates: [20, 5, 2.5],
      loadedKg: 75,
      offByKg: -1,
    });
  });

  it("reports how far over when the nearest is heavier than typed: 16 from 5s is 20", () => {
    // A side of 8 sits between 5 and 10; 10 is nearer.
    expect(loadFor(0, 16, [5])).toEqual({
      kind: "ok",
      perSideKg: 10,
      plates: [5, 5],
      loadedKg: 20,
      offByKg: 4,
    });
  });

  it("takes the lighter of two equally near sides: 15 a side from 10s is 10, not 20", () => {
    expect(loadFor(0, 30, [10])).toMatchObject({
      plates: [10],
      perSideKg: 10,
      loadedKg: 20,
      offByKg: -10,
    });
  });

  it("copes with a decimal side: 76.2 on a 20 kg machine wants 28.1 a side and loads 27.5", () => {
    // 27.5 is 0.6 away; the next reachable side, 28.75, is 0.65 away.
    expect(loadFor(20, 76.2, STANDARD_PLATES_KG)).toEqual({
      kind: "ok",
      perSideKg: 27.5,
      plates: [25, 2.5],
      loadedKg: 75,
      offByKg: -1.2,
    });
  });
});

describe("buddyLoadFor", () => {
  it("puts the lighter lifter's plates inside and the difference outside: 75 against 50 on a 20 kg machine", () => {
    const r = buddyLoadFor(20, 75, 50, STANDARD_PLATES_KG);
    expect(r.swap).toEqual({ inside: "buddy", inner: [15], outer: [10, 2.5] });
    expect(r.buddy).toEqual({ kind: "ok", perSideKg: 15, plates: [15], loadedKg: 50, offByKg: 0 });
    expect(r.you).toEqual({
      kind: "ok",
      perSideKg: 27.5,
      plates: [15, 10, 2.5],
      loadedKg: 75,
      offByKg: 0,
    });
  });

  it("gives the same answer with the names the other way round", () => {
    const r = buddyLoadFor(20, 50, 75, STANDARD_PLATES_KG);
    expect(r.swap).toEqual({ inside: "you", inner: [15], outer: [10, 2.5] });
    expect(r.you).toMatchObject({ plates: [15], perSideKg: 15, loadedKg: 50 });
    expect(r.buddy).toMatchObject({ plates: [15, 10, 2.5], perSideKg: 27.5, loadedKg: 75 });
  });

  it("has nothing to swap when both lift the same: buddy inside, outer empty", () => {
    const r = buddyLoadFor(20, 60, 60, STANDARD_PLATES_KG);
    expect(r.swap).toEqual({ inside: "buddy", inner: [20], outer: [] });
    expect(r.you).toEqual(r.buddy);
    expect(r.you).toMatchObject({ plates: [20], perSideKg: 20, loadedKg: 60, offByKg: 0 });
  });

  it("measures the difference from what the lighter side actually loads, and says how far each is off", () => {
    // No 25 or 1.25. Buddy's 50 is exact (15 a side). You typed 76: a side of
    // 28, less the 15 already on, wants 13; 12.5 is nearest, so you load 75.
    const r = buddyLoadFor(20, 76, 50, [20, 15, 10, 5, 2.5]);
    expect(r.swap).toEqual({ inside: "buddy", inner: [15], outer: [10, 2.5] });
    expect(r.you).toEqual({
      kind: "ok",
      perSideKg: 27.5,
      plates: [15, 10, 2.5],
      loadedKg: 75,
      offByKg: -1,
    });
  });

  it("takes the gap from what the lighter side loads, not what they typed", () => {
    // No 25 or 1.25. Buddy typed 52 (16 a side) but loads 50 (15 a side, 2 under).
    // You typed 74, 27 a side. From the loaded 15 the gap is 12, nearest 12.5, so
    // you load 75. Measured from the typed 16 it would be 11, nearest 10, so 70.
    const r = buddyLoadFor(20, 74, 52, [20, 15, 10, 5, 2.5]);
    expect(r.buddy).toEqual({ kind: "ok", perSideKg: 15, plates: [15], loadedKg: 50, offByKg: -2 });
    expect(r.you).toEqual({
      kind: "ok",
      perSideKg: 27.5,
      plates: [15, 10, 2.5],
      loadedKg: 75,
      offByKg: 1,
    });
    expect(r.swap).toEqual({ inside: "buddy", inner: [15], outer: [10, 2.5] });
  });

  it("adds no outside plates when the lighter side already rounds up past the heavier target", () => {
    // Only 5s. Lighter wants 3 a side and loads 5; heavier wants 4, which the
    // 5 already covers, so nothing goes outside and they load the same.
    const r = buddyLoadFor(0, 8, 6, [5]);
    expect(r.swap).toEqual({ inside: "buddy", inner: [5], outer: [] });
    expect(r.you).toEqual({ kind: "ok", perSideKg: 5, plates: [5], loadedKg: 10, offByKg: 2 });
  });

  it("has no swap when one of them is under the machine, and each load stands alone", () => {
    const r = buddyLoadFor(20, 10, 50, STANDARD_PLATES_KG);
    expect(r.you).toEqual({ kind: "below" });
    expect(r.buddy).toEqual({ kind: "ok", perSideKg: 15, plates: [15], loadedKg: 50, offByKg: 0 });
    expect(r.swap).toBeNull();
  });

  it("has no swap when both are under the machine", () => {
    const r = buddyLoadFor(20, 10, 5, STANDARD_PLATES_KG);
    expect(r).toEqual({ you: { kind: "below" }, buddy: { kind: "below" }, swap: null });
  });
});

describe("stepFor", () => {
  it("is 2.5 kg with the 1.25s in, 5 kg without", () => {
    expect(stepFor(STANDARD_PLATES_KG)).toBe(2.5);
    expect(stepFor([25, 20, 15, 10, 5, 2.5])).toBe(5);
  });

  it("is twice the smallest plate, wherever it sits in the list", () => {
    expect(stepFor([10, 25, 15])).toBe(20);
  });
});
