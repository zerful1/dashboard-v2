/** History's exercise names, so a typed name reuses one exactly: a near-twin would split an exercise's history. */
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
