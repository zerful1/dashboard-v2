export interface TDEEInput {
  avgDailyIntake: number  // kcal/day, averaged over the window
  weightChangeKg: number  // latest - earliest weight in window (kg)
  days: number            // window length in days
  daysWithFood: number    // count of distinct days in the window with at least one food entry
}

/**
 * Adaptive TDEE estimate. Gated on ≥14 days of food + ≥14-day window.
 *
 * Formula: TDEE ≈ avgDailyIntake − (weightChangeKg × 7700) / days
 *   7700 kcal/kg is the conventional energy density of body mass change.
 *   Positive weightChange means weight went up → intake exceeded TDEE → subtract.
 *   Negative weightChange means weight went down → intake was under TDEE → add.
 */
export function estimateTDEE(input: TDEEInput): number | null {
  if (input.days < 14 || input.daysWithFood < 14) return null
  const tdee = input.avgDailyIntake - (input.weightChangeKg * 7700) / input.days
  return Math.round(tdee)
}
