import { z } from "zod";
import { isRealDate } from "@dashboard/shared";

/**
 * A calendar day as the client sends it: YYYY-MM-DD, and a day that exists.
 *
 * One definition for every route. Five of them used to check the shape alone,
 * so "2026-02-31" passed validation and reached Postgres, which refused it as
 * a 500. The server never infers a date of its own (CLAUDE.md): a deployed
 * host is UTC for everyone, so the client resolves its calendar day and this
 * is the only thing standing between that string and a `date` column.
 */
export const isoDate = z.string().refine(isRealDate, "Expected a date as YYYY-MM-DD");
