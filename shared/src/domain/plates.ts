// Plate maths for plate-loaded machines. Pure: the Plates tab only draws it.

/** The standard sizes, heaviest first, kg. */
export const STANDARD_PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

/** One person's load. Plates are for ONE side, heaviest first. */
export type Load =
  | { kind: "below" } // total under the machine's starting weight
  | {
      kind: "ok";
      perSideKg: number; // sum of plates
      plates: number[]; // heaviest first; [] when total == start
      loadedKg: number; // start + 2 * perSideKg: what will actually be lifted
      offByKg: number; // loadedKg - typed total; 0 when exact, negative when under
    };

// Everything is counted in quarter-kilos so every standard plate (down to
// 1.25) is a whole number and the search never meets float drift. Results go
// back to kg by dividing by 4, which is exact for a quarter.
const UNIT = 4;

// Rounds away the dust left by halving and subtracting decimals (a side of
// 28.1 minus 0.1 must not become 28.000000000000004).
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The fewest plates that make a side as near `wantedKg` as the sizes allow,
 * heaviest first. Any size may repeat. Greedy is wrong when sizes are missing
 * (only 20s and 15s: 45 is 15 + 15 + 15, and greedy strands itself at 20 + 20),
 * so this is a proper search. A side that can't be made exactly becomes the
 * nearest one that can; on a tie the lighter, so the app never quietly asks
 * for more than was typed when it could ask for less.
 */
function sideFor(wantedKg: number, available: readonly number[]): number[] {
  const sizes = available.map((p) => Math.round(p * UNIT)).sort((a, b) => b - a);
  const wanted = wantedKg * UNIT;
  // Search past the target by one plate, so a nearer-from-above side is seen.
  const limit = Math.ceil(wanted) + sizes[0]!;
  // count[s] = fewest plates that sum to s units, Infinity when impossible.
  const count = new Array<number>(limit + 1).fill(Infinity);
  count[0] = 0;
  for (let s = 1; s <= limit; s++) {
    for (const p of sizes) {
      if (p <= s && count[s - p]! + 1 < count[s]!) count[s] = count[s - p]! + 1;
    }
  }
  // Ascending, so a tie in distance keeps the lighter. The epsilon stops a
  // halved decimal like 28.125 from looking a hair nearer on one side.
  let target = 0;
  for (let s = 1; s <= limit; s++) {
    if (count[s]! < Infinity && Math.abs(s - wanted) < Math.abs(target - wanted) - 1e-9) target = s;
  }
  // Rebuild by taking the heaviest plate that still leaves a fewest-plates
  // remainder. That makes the heavier set win a tie on count, compared
  // heaviest first (30 kg is 20 + 10, not 15 + 15).
  const plates: number[] = [];
  let s = target;
  while (s > 0) {
    const p = sizes.find((p) => p <= s && count[s - p]! === count[s]! - 1)!;
    plates.push(p / UNIT);
    s -= p;
  }
  return plates;
}

const sum = (plates: readonly number[]) => round2(plates.reduce((a, b) => a + b, 0));

export function loadFor(startKg: number, totalKg: number, available: readonly number[]): Load {
  if (totalKg < startKg) return { kind: "below" };
  const plates = sideFor((totalKg - startKg) / 2, available);
  const perSideKg = sum(plates);
  const loadedKg = round2(startKg + 2 * perSideKg);
  return { kind: "ok", perSideKg, plates, loadedKg, offByKg: round2(loadedKg - totalKg) };
}

export interface BuddyLoad {
  you: Load;
  buddy: Load;
  /**
   * Only when both are "ok". `inside` is whose side is the solid inner plates
   * (the lighter typed total; on a tie "buddy"). `inner` stays on, `outer`
   * moves, each heaviest first. `outer` is [] when both sides load the same.
   */
  swap: { inside: "you" | "buddy"; inner: number[]; outer: number[] } | null;
}

/**
 * Two people on one machine, arranged so a swap only adds or removes plates
 * on the outside: the lighter lifter's plates stay put and the difference
 * goes on top.
 */
export function buddyLoadFor(
  startKg: number,
  youKg: number,
  buddyKg: number,
  available: readonly number[],
): BuddyLoad {
  const you = loadFor(startKg, youKg, available);
  const buddy = loadFor(startKg, buddyKg, available);
  if (you.kind !== "ok" || buddy.kind !== "ok") return { you, buddy, swap: null };

  const inside = youKg < buddyKg ? "you" : "buddy";
  const [light, heavyKg] = inside === "you" ? [you, buddyKg] : [buddy, youKg];
  const inner = light.plates;
  // The difference is taken from the inner plates as loaded, not as typed, so
  // inner + outer lands as near the heavier target as the plates allow. If the
  // inner side already overshot it (rounded up) the gap is negative, and the
  // nearest side to a negative is the empty one: nothing goes outside.
  const gap = round2((heavyKg - startKg) / 2 - light.perSideKg);
  const outer = sideFor(gap, available);

  const plates = [...inner, ...outer];
  const perSideKg = sum(plates);
  const loadedKg = round2(startKg + 2 * perSideKg);
  const heavy: Load = {
    kind: "ok",
    perSideKg,
    plates,
    loadedKg,
    offByKg: round2(loadedKg - heavyKg),
  };
  return inside === "you"
    ? { you, buddy: heavy, swap: { inside, inner, outer } }
    : { you: heavy, buddy, swap: { inside, inner, outer } };
}

/** The − / + step: twice the smallest available plate. */
export function stepFor(available: readonly number[]): number {
  return round2(2 * Math.min(...available));
}
