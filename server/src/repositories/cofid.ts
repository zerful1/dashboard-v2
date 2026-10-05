import { pool } from "../db/pool";
import { T } from "../config";
import type { FoodHit } from "@dashboard/shared";

/*
 * The one repository with no userId. cofid_foods is global reference data -
 * the UK government's composition table - with no user_id column and no
 * per-user rows, so there is nothing to scope. The route still requires a
 * session.
 */

const MAX_TERMS = 6;
// Postgres ARE metacharacters: the search text is user input, and it goes into a regex.
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Row {
  food_code: string;
  name: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  fibre: number | null;
  sugar: number | null;
  satFat: number | null;
  salt: number | null;
}

/**
 * Every word must start a word in the name - `\m` is Postgres' start-of-word
 * anchor. "chick bre" finds "Chicken, breast" as you type; "oat" does not find
 * "coated", which v1's substring ILIKE did (measured against the real table).
 * Names starting with the first word rank first, then shorter names.
 */
export async function searchCofid(q: string, limit = 20): Promise<FoodHit[]> {
  const terms = q.trim().split(/\s+/).filter(Boolean).slice(0, MAX_TERMS).map(escapeRegex);
  if (terms.length === 0) return [];

  const params: (string | number)[] = terms.map((t) => `\\m${t}`);
  const where = terms.map((_, i) => `name ~* $${i + 1}`).join(" AND ");
  params.push(`^${terms[0]}`, limit);
  const rank = `$${terms.length + 1}`;
  const lim = `$${terms.length + 2}`;

  const { rows } = await pool.query<Row>(
    `SELECT food_code, name,
            kcal_per_100g::float8 AS kcal,
            COALESCE(protein_per_100g, 0)::float8 AS p,
            COALESCE(fat_per_100g, 0)::float8 AS f,
            COALESCE(carbs_per_100g, 0)::float8 AS c,
            fibre_per_100g::float8 AS fibre,
            sugar_per_100g::float8 AS sugar,
            sat_fat_per_100g::float8 AS "satFat",
            salt_per_100g::float8 AS salt
       FROM ${T.cofidFoods}
      WHERE kcal_per_100g IS NOT NULL AND ${where}
      ORDER BY (name ~* ${rank}) DESC, length(name), name
      LIMIT ${lim}`,
    params,
  );

  return rows.map((r) => {
    const per100g = { kcal: r.kcal, p: r.p, f: r.f, c: r.c, fibre: r.fibre, sugar: r.sugar, satFat: r.satFat, salt: r.salt };
    return {
      source: "cofid" as const,
      externalId: r.food_code,
      name: r.name,
      servings: [{ label: "100 g", grams: 100, ...per100g }],
      per100g,
    };
  });
}
