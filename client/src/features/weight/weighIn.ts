/** A typed weigh-in as kg, or null when it can't be saved (more than 0, less than 500); one rule for Weight and Home. */
export function parseWeighIn(raw: string): number | null {
  const kg = Number.parseFloat(raw);
  return Number.isFinite(kg) && kg > 0 && kg < 500 ? kg : null;
}
