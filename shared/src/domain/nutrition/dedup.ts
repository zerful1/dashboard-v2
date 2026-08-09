import type { FoodLogEntry } from '../../types'

export function dedupRecents(rows: FoodLogEntry[], limit: number): FoodLogEntry[] {
  const seen = new Set<string>()
  const out: FoodLogEntry[] = []
  for (const e of rows) {
    const key = e.food_item_id ?? `_name:${e.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
    if (out.length >= limit) break
  }
  return out
}
