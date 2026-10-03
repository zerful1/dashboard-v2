/**
 * History's exercise names, so a typed name reuses one exactly: stats, coaching
 * and records match names character for character, and a near-twin ("T bar
 * row" for "T Bar Row") would split one exercise's history in two.
 */
export function suggestNames(history: string[], typed: string, exclude: string[] = [], limit = 5): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const skip = new Set(exclude.map((n) => n.toLowerCase()));
  return history.filter((n) => n.toLowerCase().includes(q) && !skip.has(n.toLowerCase())).slice(0, limit);
}

/** The history's spelling of `name` when they differ only in case. */
export function canonicalName(history: string[], name: string): string {
  return history.find((n) => n.toLowerCase() === name.toLowerCase()) ?? name;
}
