export type Cell = string | number | null | undefined;

export interface CofidFood {
  food_code: string;
  name: string;
  food_group: string | null;
  kcal_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  fibre_per_100g: number | null;
  sugar_per_100g: number | null;
  sat_fat_per_100g: number | null;
  salt_per_100g: number | null;
}

/**
 * A CoFID value. "Tr" (trace) is a real, tiny amount: 0. "N" (not determined)
 * and blanks are unknown: null. Bracketed values are estimates; the brackets go.
 */
function value(cell: Cell): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  const s = cell.trim().replace(/^\((.*)\)$/, "$1");
  if (/^tr$/i.test(s)) return 0;
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** v1's importer made an undetermined macro 0; kept, so the macros do not change on re-import. */
const macro = (cell: Cell) => value(cell) ?? 0;

function column(header: Cell[], pattern: RegExp, what: string): number {
  const i = header.findIndex((h) => typeof h === "string" && pattern.test(h.trim()));
  if (i === -1) {
    throw new Error(`CoFID column not found: ${what}. Headers: ${header.filter(Boolean).join(" | ")}`);
  }
  return i;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface CofidDuplicate {
  food_code: string;
  kept: string;
  dropped: string;
}

/**
 * Parse the Proximates and Inorganics sheets (row 1 = headers; rows without a
 * food code - the code and description rows - are skipped). Foods without
 * energy are skipped, as v1 did, and counted.
 *
 * A code that appears twice keeps its FIRST food, in both sheets, and the other
 * is reported. The 2021 file gives 13-669 to roasted aubergine and to raw
 * watercress; v1's importer let the second overwrite the first's macros, which
 * is why production lists the aubergine at watercress's 10 kcal.
 */
export function parseCofid(
  proximates: Cell[][],
  inorganics: Cell[][],
): { foods: CofidFood[]; skipped: number; duplicates: CofidDuplicate[] } {
  const ph = proximates[0] ?? [];
  const col = {
    code: column(ph, /^food code$/i, "Food Code"),
    name: column(ph, /^food name$/i, "Food Name"),
    group: column(ph, /^group$/i, "Group"),
    protein: column(ph, /^protein \(g\)$/i, "Protein (g)"),
    fat: column(ph, /^fat \(g\)$/i, "Fat (g)"),
    carbs: column(ph, /^carbohydrate \(g\)$/i, "Carbohydrate (g)"),
    kcal: column(ph, /^energy \(kcal\)/i, "Energy (kcal)"),
    sugar: column(ph, /^total sugars \(g\)$/i, "Total sugars (g)"),
    fibre: column(ph, /^aoac fibre \(g\)$/i, "AOAC fibre (g)"),
    satFat: column(ph, /^satd fa \/100g fd \(g\)$/i, "Satd FA /100g fd (g)"),
  };

  const ih = inorganics[0] ?? [];
  // The 2021 file leaves this sheet's code header blank (" "); the codes are in column A.
  const inCode = ih.findIndex((h) => typeof h === "string" && /^food code$/i.test(h.trim()));
  const inCodeCol = inCode === -1 ? 0 : inCode;
  const sodiumCol = column(ih, /^sodium \(mg\)$/i, "Sodium (mg)");
  const sodium = new Map<string, number | null>();
  for (const row of inorganics.slice(1)) {
    const code = row[inCodeCol];
    // First row wins, as for the foods below.
    if (typeof code === "string" && code.trim() && !sodium.has(code.trim())) {
      sodium.set(code.trim(), value(row[sodiumCol]));
    }
  }

  const foods: CofidFood[] = [];
  const kept = new Map<string, string>();
  const duplicates: CofidDuplicate[] = [];
  let skipped = 0;
  for (const row of proximates.slice(1)) {
    const code = row[col.code];
    if (typeof code !== "string" || !code.trim()) continue;
    const kcal = value(row[col.kcal]);
    if (kcal === null) {
      skipped++;
      continue;
    }
    const name = String(row[col.name] ?? "").trim();
    const first = kept.get(code.trim());
    if (first !== undefined) {
      duplicates.push({ food_code: code.trim(), kept: first, dropped: name });
      continue;
    }
    kept.set(code.trim(), name);
    const na = sodium.get(code.trim()) ?? null;
    const group = row[col.group];
    foods.push({
      food_code: code.trim(),
      name,
      food_group: typeof group === "string" && group.trim() ? group.trim() : null,
      kcal_per_100g: kcal,
      protein_per_100g: macro(row[col.protein]),
      fat_per_100g: macro(row[col.fat]),
      carbs_per_100g: macro(row[col.carbs]),
      fibre_per_100g: value(row[col.fibre]),
      sugar_per_100g: value(row[col.sugar]),
      sat_fat_per_100g: value(row[col.satFat]),
      salt_per_100g: na === null ? null : round3((na * 2.5) / 1000),
    });
  }
  return { foods, skipped, duplicates };
}
