import { describe, it, expect } from 'vitest'
import { plausibleAdaptive } from '../src/domain/nutrition/tdeeInputs'

describe('plausibleAdaptive', () => {
  it('refuses a figure outside the human range', () => {
    expect(plausibleAdaptive(1199, null)).toBe(false)
    expect(plausibleAdaptive(5001, null)).toBe(false)
    expect(plausibleAdaptive(2400, null)).toBe(true)
  })

  it('refuses a figure more than 30% from the formula, when there is one', () => {
    // 30% of 2759 is 827.7: the band runs from 1931.3 to 3586.7.
    expect(plausibleAdaptive(2400, 2759)).toBe(true)
    expect(plausibleAdaptive(1900, 2759)).toBe(false)
    expect(plausibleAdaptive(3586, 2759)).toBe(true)
    expect(plausibleAdaptive(3600, 2759)).toBe(false)
  })
})
