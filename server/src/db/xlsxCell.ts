import type { CellValue } from "exceljs";

export type Cell = string | number | null;

/**
 * An exceljs cell value as plain text or number. A formula gives its saved
 * result (the workout tracker has two, like `=SUM(38.8+2.5)`); rich text and
 * hyperlinks give their text.
 */
export function toCell(v: CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object" && "result" in v) return toCell(v.result as CellValue);
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return null;
}
