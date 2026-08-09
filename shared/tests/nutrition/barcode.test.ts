import { describe, it, expect } from 'vitest'
import { isEanUpc } from '../../src/domain/nutrition/barcode'

describe('isEanUpc', () => {
  it('accepts a valid EAN-13', () => {
    expect(isEanUpc('4006381333931')).toBe(true)
  })

  it('rejects an EAN-13 with a bad check digit', () => {
    expect(isEanUpc('4006381333932')).toBe(false)
    expect(isEanUpc('4006381333930')).toBe(false)
  })

  it('accepts a valid UPC-A', () => {
    expect(isEanUpc('036000291452')).toBe(true)
  })

  it('rejects a UPC-A with a bad check digit', () => {
    expect(isEanUpc('036000291453')).toBe(false)
  })

  it('accepts a valid EAN-8', () => {
    expect(isEanUpc('96385074')).toBe(true)
  })

  it('rejects an EAN-8 with a bad check digit', () => {
    expect(isEanUpc('96385075')).toBe(false)
  })

  it('rejects lengths that are not 8, 12 or 13 digits', () => {
    expect(isEanUpc('1234567')).toBe(false)        // 7
    expect(isEanUpc('123456789')).toBe(false)      // 9
    expect(isEanUpc('12345678901')).toBe(false)    // 11
    expect(isEanUpc('12345678901234')).toBe(false) // 14
  })

  it('rejects non-digit input', () => {
    expect(isEanUpc('chicken breast')).toBe(false)
    expect(isEanUpc('400638133393a')).toBe(false)
  })

  it('rejects empty and whitespace-padded strings (caller is expected to trim)', () => {
    expect(isEanUpc('')).toBe(false)
    expect(isEanUpc(' 4006381333931')).toBe(false)
    expect(isEanUpc('4006381333931 ')).toBe(false)
  })
})
