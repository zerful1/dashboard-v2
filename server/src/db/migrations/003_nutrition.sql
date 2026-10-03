-- Nutrition, phase 1. Additive only: every new column is nullable, and NULL
-- means "unknown", never zero. That distinction is what lets the diary say
-- "partial" honestly, and why no row is backfilled.

-- Fibre, sugar, saturated fat and salt, per 100 g AND per serving, mirroring
-- the macro columns beside them (a restaurant wrap has only per-serving values).
ALTER TABLE food_items
  ADD COLUMN fibre_per_100g      numeric CHECK (fibre_per_100g >= 0),
  ADD COLUMN sugar_per_100g      numeric CHECK (sugar_per_100g >= 0),
  ADD COLUMN sat_fat_per_100g    numeric CHECK (sat_fat_per_100g >= 0),
  ADD COLUMN salt_per_100g       numeric CHECK (salt_per_100g >= 0),
  ADD COLUMN fibre_per_serving   numeric CHECK (fibre_per_serving >= 0),
  ADD COLUMN sugar_per_serving   numeric CHECK (sugar_per_serving >= 0),
  ADD COLUMN sat_fat_per_serving numeric CHECK (sat_fat_per_serving >= 0),
  ADD COLUMN salt_per_serving    numeric CHECK (salt_per_serving >= 0);

-- Snapshotted at write time with the macros: grams in the amount logged.
ALTER TABLE food_log_entries
  ADD COLUMN fibre_g   numeric CHECK (fibre_g >= 0),
  ADD COLUMN sugar_g   numeric CHECK (sugar_g >= 0),
  ADD COLUMN sat_fat_g numeric CHECK (sat_fat_g >= 0),
  ADD COLUMN salt_g    numeric CHECK (salt_g >= 0);

-- Filled by server/src/db/importCofid.ts from the CoFID 2021 spreadsheet.
ALTER TABLE cofid_foods
  ADD COLUMN fibre_per_100g   numeric,
  ADD COLUMN sugar_per_100g   numeric,
  ADD COLUMN sat_fat_per_100g numeric,
  ADD COLUMN salt_per_100g    numeric;

-- Optional, and used only by the nutrition TDEE hint.
ALTER TABLE profiles
  ADD COLUMN height_cm      numeric  CHECK (height_cm BETWEEN 100 AND 250),
  ADD COLUMN birth_year     smallint CHECK (birth_year >= 1900),
  ADD COLUMN sex            text     CHECK (sex IN ('male', 'female')),
  ADD COLUMN activity_level text     CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'very', 'extra'));
