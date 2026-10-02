import { describe, it, expect } from "vitest";
import { parseCofid } from "../src/db/cofidParse";
import { parseArgs } from "../src/db/importCofid";

// Headers exactly as in the 2021 file, with its code and description rows.
const PROX_HEADER = [
  "Food Code", "Food Name", "Description", "Group", "Protein (g)", "Fat (g)", "Carbohydrate (g)",
  "Energy (kcal) (kcal)", "Total sugars (g)", "AOAC fibre (g)", "Satd FA /100g fd (g)",
];
const proximates = [
  PROX_HEADER,
  [null, null, null, null, "PROT", "FAT", "CHO", "KCALS", "TOTSUG", "AOACFIB", "SATFOD"],
  [null, null, null, null, "Protein", "Fat", "Carbohydrate", "kcal", "Total sugars", "AOAC fibre", "Saturated fatty acids per 100g food"],
  ["11-800", "Oats, rolled", "", "AA", 11, 8, 60, 375, "Tr", 9, "(1.5)"],
  ["13-145", "Ackee, canned, drained", "", "DG", "2.9", "15.2", "0.8", "151", "0.8", "N", ""],
  ["99-999", "No energy here", "", "ZZ", 1, 1, 1, "N", 1, 1, 1],
];
const inorganics = [
  [" ", "Food Name", "Description", "Group", "Sodium (mg)"],
  [null, null, null, null, "NA"],
  [null, null, null, null, "Sodium"],
  ["11-800", "Oats, rolled", "", "AA", 8],
  ["13-145", "Ackee, canned, drained", "", "DG", "240"],
];

describe("parseCofid", () => {
  const { foods, skipped } = parseCofid(proximates, inorganics);

  it("reads every food with energy, and skips the rest", () => {
    expect(foods.map((f) => f.food_code)).toEqual(["11-800", "13-145"]);
    expect(skipped).toBe(1);
  });

  it("maps trace to zero, undetermined and blank to unknown, and drops estimate brackets", () => {
    expect(foods[0]).toMatchObject({ sugar_per_100g: 0, fibre_per_100g: 9, sat_fat_per_100g: 1.5 });
    expect(foods[1]).toMatchObject({ sugar_per_100g: 0.8, fibre_per_100g: null, sat_fat_per_100g: null });
  });

  it("converts sodium in mg to salt in g", () => {
    expect(foods[1]!.salt_per_100g).toBeCloseTo(0.6); // 240 mg x 2.5 / 1000
    expect(foods[0]!.salt_per_100g).toBeCloseTo(0.02);
  });

  it("keeps the macros and the name", () => {
    expect(foods[1]).toMatchObject({ name: "Ackee, canned, drained", food_group: "DG", kcal_per_100g: 151, protein_per_100g: 2.9 });
  });

  it("names a missing column rather than importing garbage", () => {
    const broken = [PROX_HEADER.map((h) => (h === "AOAC fibre (g)" ? "Fibre" : h)), ...proximates.slice(1)];
    expect(() => parseCofid(broken, inorganics)).toThrow(/AOAC fibre/);
  });

  // The real 2021 file gives 13-669 to both roasted aubergine and raw watercress.
  // Two rows with one code in one upsert would fail, or let the second silently
  // replace the first; the first is kept and the other reported instead.
  it("keeps the first of two foods sharing a code, and reports the other", () => {
    const withDupe = [...proximates, ["11-800", "Watercress, raw", "", "DG", 1.9, 0.3, "Tr", 10, 0, 1, 0]];
    // The sodium sheet repeats the code too; its first row must win as well.
    const sodiumDupe = [...inorganics, ["11-800", "Watercress, raw", "", "DG", 9999]];
    const out = parseCofid(withDupe, sodiumDupe);
    expect(out.foods.filter((f) => f.food_code === "11-800")).toEqual([
      expect.objectContaining({ name: "Oats, rolled", kcal_per_100g: 375, salt_per_100g: 0.02 }),
    ]);
    expect(out.duplicates).toEqual([{ food_code: "11-800", kept: "Oats, rolled", dropped: "Watercress, raw" }]);
  });
});

describe("parseArgs", () => {
  it("needs a file and an explicit schema, and defaults to a dry run", () => {
    expect(parseArgs(["cofid.xlsx", "--schema", "app_dev"])).toEqual({ file: "cofid.xlsx", schema: "app_dev", apply: false });
    expect(parseArgs(["cofid.xlsx", "--schema", "app", "--apply"]).apply).toBe(true);
    expect(() => parseArgs(["cofid.xlsx"])).toThrow(/--schema is required/);
    expect(() => parseArgs(["--schema", "app_dev"])).toThrow(/Usage/);
  });

  it("refuses the test schema, the retired v1 schema and unsafe names", () => {
    expect(() => parseArgs(["f.xlsx", "--schema", "app_test"])).toThrow(/Refusing/);
    expect(() => parseArgs(["f.xlsx", "--schema", "public"])).toThrow(/Refusing/);
    expect(() => parseArgs(["f.xlsx", "--schema", "app; DROP TABLE x"])).toThrow(/Refusing/);
  });
});
