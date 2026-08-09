import { describe, it, expect } from 'vitest'
import { addDay, removeDay, renameDay, setWeekSlot } from '../src/domain/splitEditor'
import { DEFAULT_SPLIT, type SplitConfig } from '../src/domain/splitRotation'

// A small known config: days 1 (Legs) and 2 (Pull), week = Mon→Legs, rest of week rest.
function base(): SplitConfig {
  return {
    days: [
      { day_type: 1, label: 'Legs' },
      { day_type: 2, label: 'Pull' },
    ],
    week: [1, 2, 'rest', 'rest', 'rest', 'rest', 'rest'],
  }
}

describe('addDay', () => {
  it('appends a new day with day_type = max + 1', () => {
    const next = addDay(base(), 'Arms')
    expect(next.days).toHaveLength(3)
    expect(next.days[2]).toEqual({ day_type: 3, label: 'Arms' })
  })

  it('allocates day_type 1 for an empty split', () => {
    const next = addDay({ days: [], week: Array(7).fill('rest') })
    expect(next.days[0]?.day_type).toBe(1)
  })

  it('does not reuse a gap below the max', () => {
    // days 1 and 5 present → next is 6, not 2/3/4
    const cfg: SplitConfig = {
      days: [{ day_type: 1, label: 'A' }, { day_type: 5, label: 'B' }],
      week: Array(7).fill('rest'),
    }
    expect(addDay(cfg).days[2]?.day_type).toBe(6)
  })

  it('does not mutate the input', () => {
    const cfg = base()
    addDay(cfg)
    expect(cfg.days).toHaveLength(2)
  })
})

describe('removeDay', () => {
  it('drops the day from the list', () => {
    const next = removeDay(base(), 1)
    expect(next.days.map(d => d.day_type)).toEqual([2])
  })

  it('resets week slots that pointed at the removed day to rest', () => {
    const next = removeDay(base(), 1)
    expect(next.week).toEqual(['rest', 2, 'rest', 'rest', 'rest', 'rest', 'rest'])
  })

  it('leaves other week slots untouched', () => {
    const next = removeDay(base(), 2)
    expect(next.week[0]).toBe(1)
    expect(next.week[1]).toBe('rest')
  })
})

describe('renameDay', () => {
  it('changes only the matching day label', () => {
    const next = renameDay(base(), 2, 'Back')
    expect(next.days).toEqual([
      { day_type: 1, label: 'Legs' },
      { day_type: 2, label: 'Back' },
    ])
  })

  it('is a no-op for an unknown day_type', () => {
    const next = renameDay(base(), 99, 'X')
    expect(next.days).toEqual(base().days)
  })
})

describe('setWeekSlot', () => {
  it('assigns a day_type to a weekday', () => {
    const next = setWeekSlot(base(), 2, 2) // Wednesday → Pull
    expect(next.week[2]).toBe(2)
  })

  it('can set a weekday to rest', () => {
    const next = setWeekSlot(base(), 0, 'rest') // Monday → rest
    expect(next.week[0]).toBe('rest')
  })

  it('does not mutate the input', () => {
    const cfg = base()
    setWeekSlot(cfg, 0, 'rest')
    expect(cfg.week[0]).toBe(1)
  })
})

describe('reducers compose into a full custom split', () => {
  it('builds a 3-day split from DEFAULT_SPLIT edits', () => {
    let cfg = DEFAULT_SPLIT
    cfg = addDay(cfg, 'Arms')              // day_type 6
    cfg = renameDay(cfg, 6, 'Arms & Abs')
    cfg = setWeekSlot(cfg, 3, 6)           // Thursday → Arms & Abs
    expect(cfg.days[cfg.days.length - 1]).toEqual({ day_type: 6, label: 'Arms & Abs' })
    expect(cfg.week[3]).toBe(6)
  })
})
