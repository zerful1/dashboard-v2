import { Workbook, type CellValue } from "exceljs";
import { pool, withTransaction } from "./pool";
import { parseCofid, type Cell, type CofidFood } from "./cofidParse";

export interface ImportArgs {
  file: string;
  schema: string;
  apply: boolean;
}

/**
 * Refuses by SHAPE before touching anything, like seedDev and tests/setup.ts.
 * The schema must be named on the command line - never read from DB_SCHEMA,
 * where a stale .env could supply the wrong one - and must not be app_test
 * (tests own their fixtures) or public (the retired v1 app: never written to).
 * Without --apply nothing is written at all.
 */
export function parseArgs(argv: string[]): ImportArgs {
  const file = argv[0] && !argv[0].startsWith("--") ? argv[0] : undefined;
  if (!file) throw new Error("Usage: npm run import-cofid -- <CoFID.xlsx> --schema <name> [--apply]");
  const i = argv.indexOf("--schema");
  const schema = i === -1 ? undefined : argv[i + 1];
  if (!schema || schema.startsWith("--")) throw new Error("--schema is required; it is never read from DB_SCHEMA");
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Refusing unsafe schema name: ${schema}`);
  if (schema === "app_test" || schema === "public") throw new Error(`Refusing to write cofid_foods in ${schema}`);
  return { file, schema, apply: argv.includes("--apply") };
}

function toCell(v: CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object" && "result" in v) return toCell(v.result as CellValue);
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return null;
}

function readSheet(wb: Workbook, pattern: RegExp): Cell[][] {
  const ws = wb.worksheets.find((w) => pattern.test(w.name));
  if (!ws) throw new Error(`No sheet matching ${pattern}. Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // row.values is 1-based: index 0 is always empty.
    rows.push((row.values as CellValue[]).slice(1).map(toCell));
  });
  return rows;
}

const COLUMNS = [
  "food_code", "name", "food_group", "kcal_per_100g", "protein_per_100g", "fat_per_100g", "carbs_per_100g",
  "fibre_per_100g", "sugar_per_100g", "sat_fat_per_100g", "salt_per_100g",
] as const satisfies readonly (keyof CofidFood)[];
const CHUNK = 400; // 400 x 11 parameters, far under Postgres' 65535

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const table = `${args.schema}.cofid_foods`;

  const ready = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'cofid_foods' AND column_name = 'fibre_per_100g'`,
    [args.schema],
  );
  if (ready.rowCount === 0) {
    throw new Error(`${table} has no label-nutrient columns. Run the migrations for ${args.schema} first.`);
  }

  const wb = new Workbook();
  await wb.xlsx.readFile(args.file);
  const { foods, skipped, duplicates } = parseCofid(readSheet(wb, /proximates/i), readSheet(wb, /inorganics/i));

  const existing = new Set(
    (await pool.query<{ food_code: string }>(`SELECT food_code FROM ${table}`)).rows.map((r) => r.food_code),
  );
  const known = (k: keyof CofidFood) => foods.filter((f) => f[k] !== null).length;
  console.log(`${args.file}`);
  console.log(`  parsed ${foods.length} foods (${skipped} without energy skipped)`);
  console.log(
    `  ${table}: ${foods.filter((f) => existing.has(f.food_code)).length} to update, ` +
      `${foods.filter((f) => !existing.has(f.food_code)).length} new`,
  );
  console.log(
    `  known: fibre ${known("fibre_per_100g")} · sugar ${known("sugar_per_100g")} · ` +
      `sat fat ${known("sat_fat_per_100g")} · salt ${known("salt_per_100g")}`,
  );
  for (const d of duplicates) {
    console.log(`  duplicate code ${d.food_code}: kept "${d.kept}", dropped "${d.dropped}"`);
  }

  if (!args.apply) {
    console.log("Dry run - nothing written. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  await withTransaction(async (client) => {
    for (let i = 0; i < foods.length; i += CHUNK) {
      const chunk = foods.slice(i, i + CHUNK);
      const values = chunk
        .map((_, r) => `(${COLUMNS.map((__, c) => `$${r * COLUMNS.length + c + 1}`).join(", ")})`)
        .join(", ");
      await client.query(
        `INSERT INTO ${table} (${COLUMNS.join(", ")}) VALUES ${values}
         ON CONFLICT (food_code) DO UPDATE SET
           ${COLUMNS.slice(1).map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`,
        chunk.flatMap((f) => COLUMNS.map((c) => f[c])),
      );
    }
  });
  console.log(`Wrote ${foods.length} rows to ${table}.`);
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
