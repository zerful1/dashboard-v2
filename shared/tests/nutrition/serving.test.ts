import { describe, it, expect } from 'vitest'
import { resolveMacros } from '../../src/domain/nutrition/serving'
import type { FoodHit } from '../../src/types'

const hit: FoodHit = {
  source: 'cofid',
  externalId: 'x',
  name: 'oats',
  servings: [
    { label: '100 g', grams: 100, kcal: 380, p: 13, f: 7, c: 65 },
    { label: '40 g serving', grams: 40, kcal: 152, p: 5.2, f: 2.8, c: 26 },
  ],
  per100g: { kcal: 380, p: 13, f: 7, c: 65 },
}

describe('resolveMacros', () => {
  it('scales the picked serving by quantity (unit=serving)', () => {
    const out = resolveMacros(hit, hit.servings[1]!, 2, 'serving')
    expect(out.kcal).toBeCloseTo(304)
    expect(out.p).toBeCloseTo(10.4)
  })

  it('scales by grams against per100g (unit=g)', () => {
    const out = resolveMacros(hit, hit.servings[0]!, 80, 'g')
    expect(out.kcal).toBeCloseTo(304)
    expect(out.c).toBeCloseTo(52)
  })

  it('falls back to the picked serving when per100g is null and unit=g', () => {
    const hit2: FoodHit = { ...hit, per100g: null }
    const out = resolveMacros(hit2, hit2.servings[1]!, 80, 'g')
    expect(out.kcal).toBeCloseTo(304)
  })

  it('returns zeroes for zero quantity', () => {
    expect(resolveMacros(hit, hit.servings[0]!, 0, 'g').kcal).toBe(0)
  })
})
