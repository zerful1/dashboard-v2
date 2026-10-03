import { describe, it, expect } from 'vitest'
import { resolveLabelNutrients, sumLabelNutrients } from '../../src/domain/nutrition/labels'
import type { FoodHit, LabelTotals } from '../../src/types'

const oats: FoodHit = {
  source: 'cofid',
  externalId: 'x',
  name: 'Oats',
  servings: [
    { label: '100 g', grams: 100, kcal: 375, p: 11, f: 8, c: 60, fibre: 9, sugar: 1, satFat: 1.5, salt: 0.02 },
    { label: '40 g bowl', grams: 40, kcal: 150, p: 4.4, f: 3.2, c: 24, fibre: 3.6, sugar: null, satFat: 0.6, salt: 0.01 },
  ],
  per100g: { kcal: 375, p: 11, f: 8, c: 60, fibre: 9, sugar: 1, satFat: 1.5, salt: 0.02 },
}

describe('resolveLabelNutrients', () => {
  it('scales per 100 g for an amount in grams', () => {
    const out = resolveLabelNutrients(oats, oats.servings[0]!, 80, 'g')
    expect(out.fibre_g).toBeCloseTo(7.2)
    expect(out.salt_g).toBeCloseTo(0.016)
  })

  it('uses the picked serving for servings, and keeps an unknown value null', () => {
    const out = resolveLabelNutrients(oats, oats.servings[1]!, 2, 'serving')
    expect(out.fibre_g).toBeCloseTo(7.2)
    expect(out.sugar_g).toBeNull()
  })

  it("falls back to the serving's grams when there is no per-100 g value", () => {
    const out = resolveLabelNutrients({ per100g: null }, oats.servings[1]!, 20, 'g')
    expect(out.fibre_g).toBeCloseTo(1.8)
  })

  it('is all null when nothing is known, never zero', () => {
    const bare = { per100g: { kcal: 100, p: 1, f: 1, c: 1 } }
    const serving = { label: '100 g', grams: 100, kcal: 100, p: 1, f: 1, c: 1 }
    expect(resolveLabelNutrients(bare, serving, 50, 'g')).toEqual({
      fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null,
    })
  })

  it('is all null for a zero quantity', () => {
    expect(resolveLabelNutrients(oats, oats.servings[0]!, 0, 'g').fibre_g).toBeNull()
  })
})

describe('sumLabelNutrients', () => {
  const e = (v: Partial<LabelTotals>): LabelTotals => ({
    fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null, ...v,
  })

  it('sums known values', () => {
    expect(sumLabelNutrients([e({ fibre_g: 3 }), e({ fibre_g: 4.5 })]).fibre_g)
      .toEqual({ total: 7.5, partial: false })
  })

  it('marks a total partial when some entries lack the value', () => {
    expect(sumLabelNutrients([e({ fibre_g: 3 }), e({})]).fibre_g)
      .toEqual({ total: 3, partial: true })
  })

  // The 19 migrated June entries: every label nutrient unknown. That day must
  // read "—", not "0 g".
  it('is null, not zero, when no entry knows the value', () => {
    expect(sumLabelNutrients([e({}), e({})]).salt_g).toEqual({ total: null, partial: false })
  })

  it('is null for an empty day', () => {
    expect(sumLabelNutrients([]).fibre_g).toEqual({ total: null, partial: false })
  })

  it('counts a known zero as known', () => {
    expect(sumLabelNutrients([e({ sugar_g: 0 }), e({ sugar_g: 2 })]).sugar_g)
      .toEqual({ total: 2, partial: false })
  })
})
