import { z } from "zod";
import { isRealDate } from "@dashboard/shared";

/** A YYYY-MM-DD that exists: "2026-02-31" must not reach Postgres, where it is a 500. */
export const isoDate = z.string().refine(isRealDate, "Expected a date as YYYY-MM-DD");

/** An IANA zone or UTC, by name only: Postgres reads a bare "+01:00" with the sign reversed. */
export function isTimeZone(zone: string): boolean {
  if (zone !== "UTC" && !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
