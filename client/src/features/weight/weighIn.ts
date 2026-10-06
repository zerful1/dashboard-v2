/**
 * A typed weigh-in as kg, or null when it can't be saved: more than 0 and less
 * than 500. The one rule for the Weight page and Home, so the two can't drift.
 */
export function parseWeighIn(raw: string): number | null {
  const kg = Number.parseFloat(raw);
  return Number.isFinite(kg) && kg > 0 && kg < 500 ? kg : null;
}
