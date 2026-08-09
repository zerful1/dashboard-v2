import type { Media, MediaStatus, MediaType } from '../types'

// Status sets live here (not the DB) so the `status` text column stays flexible.
// Order matters: it's the order chips/segments render in.
export const WATCH_STATUSES: MediaStatus[] = ['Watching', 'Plan to Watch', 'Completed', 'Paused', 'Dropped']
export const GAME_STATUSES: MediaStatus[] = ['Playing', 'Plan to Play', 'Completed', 'Paused', 'Dropped']

export function statusesFor(type: MediaType): MediaStatus[] {
  return type === 'game' ? GAME_STATUSES : WATCH_STATUSES
}

/** New-item default: planned, not active. */
export function defaultStatusFor(type: MediaType): MediaStatus {
  return type === 'game' ? 'Plan to Play' : 'Plan to Watch'
}

/** The "currently consuming" status — Playing for games, Watching for films/series. */
export function isActive(m: Media): boolean {
  return m.status === 'Watching' || m.status === 'Playing'
}

// ── Rating colour scale ──────────────────────────────────────────────
// red (<5) → amber (5–7.4) → green (≥7.5). There is no amber token in the
// palette, so amber is an arbitrary value tuned to the app's desaturated
// red/green (#d98c84 / #6dbf99). Unrated items render faint.
export function ratingColorClass(rating: number | null): string {
  if (rating == null) return 'text-text-faint'
  if (rating < 5) return 'text-negative'
  if (rating < 7.5) return 'text-[#d8a657]'
  return 'text-positive'
}

// ── Filtering + sorting ──────────────────────────────────────────────
export function filterByStatus(items: Media[], status: MediaStatus | 'all'): Media[] {
  return status === 'all' ? items : items.filter(m => m.status === status)
}

export type SortKey = 'rating' | 'name' | 'added'

/** Returns a new sorted array — never mutates the input (it's React-Query cache data). */
export function sortMedia(items: Media[], key: SortKey): Media[] {
  const copy = [...items]
  switch (key) {
    case 'rating':
      // Highest first; unrated sink to the bottom (treated as -∞).
      return copy.sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'added':
      // Newest first. created_at is an ISO string, so lexical compare == chronological.
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
}

// ── Replay suggestions (games) ───────────────────────────────────────
/**
 * Date `months` calendar-months before `from`. Uses Date.setMonth, which rolls
 * the year over correctly; on a day the target month lacks (e.g. the 31st) JS
 * spills into the next month — negligible for a 5-month replay window.
 */
export function monthsBefore(months: number, from: Date = new Date()): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() - months)
  return d
}

/**
 * A replay suggestion is a game that is Completed, rated ≥ 7.0, last played
 * more than 5 months ago, and not dismissed. `last_played` null means it was
 * never actually played to completion in-app, so it is not suggested.
 */
export function isReplaySuggestion(m: Media, now: Date = new Date()): boolean {
  if (m.type !== 'game') return false
  if (m.status !== 'Completed') return false
  if (m.replay_dismissed) return false
  if (m.rating == null || m.rating < 7.0) return false
  if (!m.last_played) return false
  return new Date(m.last_played + 'T00:00:00') < monthsBefore(5, now)
}
