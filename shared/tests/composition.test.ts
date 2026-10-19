import { describe, it, expect } from 'vitest'
import { compositionLine } from '../src/domain/composition'
import type { TrendFit } from '../src/domain/insights/projection'
import type { LiftStatus } from '../src/domain/liftProgress'

const fit = (ratePerWeek: number, current = 80): TrendFit => ({ status: 'fit', ratePerWeek, current, slope: ratePerWeek / 7 })
/** moving, stalled, back, then any others. */
const lifts = (m: number, s: number, b: number, extra: LiftStatus[] = []): LiftStatus[] =>
  [...Array(m).fill('moving'), ...Array(s).fill('stalled'), ...Array(b).fill('back'), ...extra]
const CUT = { target_kg: 78, start_kg: 84 }
const BULK = { target_kg: 85, start_kg: 76 }
const verdict = (...a: Parameters<typeof compositionLine>) => compositionLine(...a)?.verdict
const tone = (...a: Parameters<typeof compositionLine>) => compositionLine(...a)?.tone

// Housekeeping spec §4: the weight's direction from the rate line's own fit,
// and the strength side from Gym's lift statuses.
describe('compositionLine', () => {
  it.each([
    { f: fit(-0.4), l: lifts(6, 0, 1), g: CUT, verdict: 'Losing fat, keeping strength', tone: 'good' },
    { f: fit(-0.4), l: lifts(1, 1, 2), g: CUT, verdict: 'Losing weight, strength slipping', tone: 'caution' },
    { f: fit(0.4), l: lifts(3, 1, 1), g: BULK, verdict: 'Gaining, lifts climbing', tone: 'good' },
    { f: fit(0.4), l: lifts(1, 1, 1), g: BULK, verdict: 'Gaining, lifts not keeping up', tone: 'caution' },
    { f: fit(0.01), l: lifts(3, 1, 1), g: CUT, verdict: 'Weight steady, lifts climbing', tone: 'good' },
    { f: fit(0.01), l: lifts(1, 2, 1), g: CUT, verdict: 'Weight steady, lifts holding', tone: 'neutral' },
    // R2, the user's call: "lifts holding" would sit beside "2 slipping".
    { f: fit(0.01), l: lifts(0, 1, 2), g: CUT, verdict: 'Weight steady, strength slipping', tone: 'caution' },
  ] as const)('reads the table: "$verdict", $tone', ({ f, l, g, verdict, tone }) => {
    expect(compositionLine(f, [...l], g)).toMatchObject({ verdict, tone })
  })

  it('is green on the weight only toward the goal', () => {
    expect(tone(fit(-0.4), lifts(6, 0, 1), BULK)).toBe('neutral')
    expect(tone(fit(0.4), lifts(3, 1, 1), CUT)).toBe('neutral')
    expect(tone(fit(-0.4), lifts(6, 0, 1), null)).toBe('neutral')
  })

  it('goes white once the goal is reached, as the rate line does', () => {
    expect(compositionLine(fit(0.2, 77.5), lifts(3, 1, 1), CUT)).toMatchObject({ verdict: 'Gaining, lifts climbing', tone: 'neutral' })
    expect(tone(fit(-0.5, 77.9), lifts(6, 0, 1), CUT)).toBe('neutral')
  })

  it('splits flat from moving where the rate line does', () => {
    expect(verdict(fit(-0.05), lifts(6, 0, 1), CUT)).toBe('Losing fat, keeping strength')
    expect(verdict(fit(-0.049), lifts(6, 0, 1), CUT)).toBe('Weight steady, lifts climbing')
    expect(verdict(fit(0.05), lifts(6, 0, 1), CUT)).toBe('Gaining, lifts climbing')
  })

  it('counts exactly half slipping as slipping', () => {
    expect(verdict(fit(-0.4), lifts(2, 0, 2), CUT)).toBe('Losing weight, strength slipping')
    expect(verdict(fit(-0.4), lifts(3, 0, 2), CUT)).toBe('Losing fat, keeping strength')
  })

  it('is hidden without a fit, or under 3 counted lifts', () => {
    expect(compositionLine({ status: 'not-enough-data', have: 9, need: 14 }, lifts(6, 0, 1), CUT)).toBeNull()
    expect(compositionLine(fit(-0.4), lifts(1, 1, 0, ['new', 'new', 'old', 'new']), CUT)).toBeNull()
    expect(compositionLine(fit(-0.4), [], CUT)).toBeNull()
    expect(compositionLine(fit(-0.4), lifts(1, 1, 1), CUT)).not.toBeNull()
  })

  it('words the detail, naming every group there is', () => {
    const detail = (m: number, s: number, b: number) => compositionLine(fit(-0.4), lifts(m, s, b), CUT)?.detail
    expect(detail(6, 0, 1)).toBe('6 lifts climbing, 1 slipping')
    expect(detail(1, 3, 2)).toBe('1 lift climbing, 3 holding, 2 slipping')
    expect(detail(0, 4, 0)).toBe('4 lifts holding')
    expect(detail(0, 1, 3)).toBe('1 lift holding, 3 slipping')
    expect(detail(2, 5, 0)).toBe('2 lifts climbing, 5 holding')
  })

  // The final review: leaving holding out paired a green "keeping strength"
  // with only "2 lifts slipping", the usual state on a cut.
  it('shows the holding lifts a verdict rests on', () => {
    expect(compositionLine(fit(-0.4), lifts(0, 3, 2), CUT)).toMatchObject({
      verdict: 'Losing fat, keeping strength',
      detail: '3 lifts holding, 2 slipping',
    })
    expect(compositionLine(fit(0.01), lifts(1, 2, 1), CUT)).toMatchObject({
      verdict: 'Weight steady, lifts holding',
      detail: '1 lift climbing, 2 holding, 1 slipping',
    })
  })
})
