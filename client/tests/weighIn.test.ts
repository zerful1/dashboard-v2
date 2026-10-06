import { describe, it, expect } from "vitest";
import { parseWeighIn } from "../src/features/weight/weighIn";

// The one rule for a typed weigh-in, shared by the Weight page and Home.
describe("parseWeighIn", () => {
  it("reads a weight", () => {
    expect(parseWeighIn("80.6")).toBe(80.6);
    expect(parseWeighIn(" 82 ")).toBe(82);
  });
  it("refuses what cannot be a body weight", () => {
    for (const raw of ["", "abc", "0", "-3", "500", "1000"]) expect(parseWeighIn(raw), raw).toBeNull();
  });
});
