import { describe, it, expect } from 'vitest'
import {
  filterByStatus,
  isActive,
  isReplaySuggestion,
  ratingColorClass,
  sortMedia,
  statusesFor,
  defaultStatusFor,
} from '../src/domain/media'
import type { Media, MediaType } from '../src/types'

const NOW = new Date('2026-06-24T12:00:00')

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: crypto.randomUUID(),
    user_id: 'u',
    type: 'game',
    name: 'Game',
    status: 'Completed',
    rating: 8.0,
    last_played: '2026-01-01', // ~5.7 months before NOW
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    replay_dismissed: false,
    ...overrides,
  }
}

describe('statusesFor / defaultStatusFor', () => {
  it('gives games their own labels', () => {
    expect(statusesFor('game')).toContain('Playing')
    expect(statusesFor('game')).toContain('Plan to Play')
    expect(defaultStatusFor('game')).toBe('Plan to Play')
  })
  it('films and series share the watch labels', () => {
    for (const t of ['film', 'series'] as MediaType[]) {
      expect(statusesFor(t)).toContain('Watching')
      expect(defaultStatusFor(t)).toBe('Plan to Watch')
    }
  })
})

describe('isActive', () => {
  it('is true for Watching and Playing only', () => {
    expect(isActive(makeMedia({ status: 'Playing' }))).toBe(true)
    expect(isActive(makeMedia({ type: 'film', status: 'Watching' }))).toBe(true)
    expect(isActive(makeMedia({ status: 'Completed' }))).toBe(false)
    expect(isActive(makeMedia({ status: 'Paused' }))).toBe(false)
  })
})

describe('ratingColorClass', () => {
  it('maps the colour scale red → amber → green', () => {
    expect(ratingColorClass(null)).toBe('text-text-faint')
    expect(ratingColorClass(4.9)).toBe('text-negative')
    expect(ratingColorClass(5)).toBe('text-[#d8a657]')
    expect(ratingColorClass(7.4)).toBe('text-[#d8a657]')
    expect(ratingColorClass(7.5)).toBe('text-positive')
    expect(ratingColorClass(10)).toBe('text-positive')
  })
})

describe('filterByStatus', () => {
  const items = [
    makeMedia({ status: 'Playing' }),
    makeMedia({ status: 'Completed' }),
    makeMedia({ status: 'Completed' }),
  ]
  it('passes everything through on "all"', () => {
    expect(filterByStatus(items, 'all')).toHaveLength(3)
  })
  it('filters to an exact status', () => {
    expect(filterByStatus(items, 'Completed')).toHaveLength(2)
    expect(filterByStatus(items, 'Playing')).toHaveLength(1)
  })
})

describe('sortMedia', () => {
  it('sorts by rating desc with unrated last, without mutating input', () => {
    const input = [
      makeMedia({ rating: 6 }),
      makeMedia({ rating: null }),
      makeMedia({ rating: 9 }),
    ]
    const out = sortMedia(input, 'rating')
    expect(out.map(m => m.rating)).toEqual([9, 6, null])
    expect(input.map(m => m.rating)).toEqual([6, null, 9]) // original untouched
  })
  it('sorts by name A→Z', () => {
    const out = sortMedia([makeMedia({ name: 'Zelda' }), makeMedia({ name: 'Alan Wake' })], 'name')
    expect(out.map(m => m.name)).toEqual(['Alan Wake', 'Zelda'])
  })
  it('sorts by date added newest first', () => {
    const out = sortMedia(
      [
        makeMedia({ name: 'old', created_at: '2026-01-01T00:00:00Z' }),
        makeMedia({ name: 'new', created_at: '2026-06-01T00:00:00Z' }),
      ],
      'added',
    )
    expect(out.map(m => m.name)).toEqual(['new', 'old'])
  })
})

describe('isReplaySuggestion', () => {
  it('suggests a completed, well-rated game played > 5 months ago', () => {
    expect(isReplaySuggestion(makeMedia(), NOW)).toBe(true)
  })
  it('excludes non-games', () => {
    expect(isReplaySuggestion(makeMedia({ type: 'film', status: 'Completed' }), NOW)).toBe(false)
  })
  it('excludes non-completed', () => {
    expect(isReplaySuggestion(makeMedia({ status: 'Playing' }), NOW)).toBe(false)
  })
  it('excludes dismissed', () => {
    expect(isReplaySuggestion(makeMedia({ replay_dismissed: true }), NOW)).toBe(false)
  })
  it('excludes ratings below 7.0', () => {
    expect(isReplaySuggestion(makeMedia({ rating: 6.9 }), NOW)).toBe(false)
    expect(isReplaySuggestion(makeMedia({ rating: 7.0 }), NOW)).toBe(true)
  })
  it('excludes never-played (null last_played)', () => {
    expect(isReplaySuggestion(makeMedia({ last_played: null }), NOW)).toBe(false)
  })
  it('excludes recently played (within 5 months)', () => {
    expect(isReplaySuggestion(makeMedia({ last_played: '2026-05-01' }), NOW)).toBe(false)
  })
})
