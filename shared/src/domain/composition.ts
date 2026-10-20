import type { Goal } from '../types'
import { isFlatRate, rateTone, type TrendFit } from './insights/projection'
import type { LiftStatus } from './liftProgress'

export interface CompositionLine {
  verdict: string
  detail: string
  tone: 'good' | 'caution' | 'neutral'
}

/**
 * What the weight is made of, in one line (housekeeping spec §4): "Losing fat,
 * keeping strength · 6 lifts climbing, 1 slipping". The weight's direction is
 * the rate line's own fit and "flat" threshold, and its colour the rate line's
 * own rule (rateTone), so the two lines never disagree. The strength side is
 * Gym's lift statuses. Never red: a warning is amber.
 *
 * Null when there is too little to say: no fit, or fewer than 3 lifts with a
 * status that counts. New lifts (no earlier span to compare) and old ones (not
 * trained lately) say nothing about now, so they don't count.
 */
export function compositionLine(
  fit: TrendFit,
  lifts: LiftStatus[],
  goal: Pick<Goal, 'target_kg' | 'start_kg'> | null,
): CompositionLine | null {
  if (fit.status !== 'fit') return null
  const climbing = lifts.filter((s) => s === 'moving').length
  const holding = lifts.filter((s) => s === 'stalled').length
  const slipping = lifts.filter((s) => s === 'back').length
  const counted = climbing + holding + slipping
  if (counted < 3) return null

  const losing = slipping * 2 >= counted // half or more
  const climbingLed = climbing > slipping
  const detail = detailOf(climbing, holding, slipping)
  const line = (verdict: string, tone: CompositionLine['tone']): CompositionLine => ({ verdict, detail, tone })

  if (isFlatRate('weight', fit.ratePerWeek)) {
    if (climbingLed) return line('Weight steady, lifts climbing', 'good')
    return losing ? line('Weight steady, strength slipping', 'caution') : line('Weight steady, lifts holding', 'neutral')
  }
  if (fit.ratePerWeek < 0) {
    return losing ? line('Losing weight, strength slipping', 'caution') : line('Losing fat, keeping strength', rateTone(fit, goal))
  }
  return climbingLed ? line('Gaining, lifts climbing', rateTone(fit, goal)) : line('Gaining, lifts not keeping up', 'caution')
}

/**
 * "6 lifts climbing, 1 slipping": every non-zero group, holding included, so a
 * verdict that rests on the holding lifts ("keeping strength", "lifts
 * holding") has them beside it (the final review on PR 3).
 */
function detailOf(climbing: number, holding: number, slipping: number): string {
  const groups: [number, string][] = [
    [climbing, 'climbing'],
    [holding, 'holding'],
    [slipping, 'slipping'],
  ]
  return groups
    .filter(([n]) => n > 0)
    .map(([n, word], i) => (i === 0 ? `${n} ${n === 1 ? 'lift' : 'lifts'} ${word}` : `${n} ${word}`))
    .join(', ')
}
