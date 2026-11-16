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

// Counted in quarter-kilos so every standard plate is a whole number and the search meets no float drift.
const UNIT = 4;

// Rounds away float dust from halving and subtracting decimals.
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fewest plates nearest `wantedKg`; a search, since greedy strands itself when sizes are missing. */
function sideFor(wantedKg: number, available: readonly number[]): number[] {
  const sizes = available.map((p) => Math.round(p * UNIT)).sort((a, b) => b - a);
  const wanted = wantedKg * UNIT;
  // Search one plate past the target so a nearer-from-above side is seen.
  const limit = Math.ceil(wanted) + sizes[0]!;
  // count[s] = fewest plates that sum to s units, Infinity when impossible.
  const count = new Array<number>(limit + 1).fill(Infinity);
  count[0] = 0;
  for (let s = 1; s <= limit; s++) {
    for (const p of sizes) {
      if (p <= s && count[s - p]! + 1 < count[s]!) count[s] = count[s - p]! + 1;
    }
  }
  // Ascending, so a tie keeps the lighter; the epsilon stops a halved decimal looking nearer on one side.
  let target = 0;
  for (let s = 1; s <= limit; s++) {
    if (count[s]! < Infinity && Math.abs(s - wanted) < Math.abs(target - wanted) - 1e-9) target = s;
  }
  // Take the heaviest plate that still leaves a fewest-plates remainder, so the heavier set wins a count tie.
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
  /** Only when both are "ok": `inside` holds the inner plates (lighter total), `outer` moves. */
  swap: { inside: "you" | "buddy"; inner: number[]; outer: number[] } | null;
}

/** Two people on one machine: the lighter lifter's plates stay put and the difference goes outside. */
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
  // The gap is from the inner plates as loaded, not typed; a negative gap (inner overshot) loads nothing outside.
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
