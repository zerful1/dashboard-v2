import type { CellValue } from "exceljs";

export type Cell = string | number | null;

/** An exceljs cell as plain text or number: formulas give their saved result. */
export function toCell(v: CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object" && "result" in v) return toCell(v.result as CellValue);
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return null;
}
