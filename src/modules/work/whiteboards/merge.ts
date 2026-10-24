/** An Excalidraw element as far as merging cares: id plus its edit counter. */
type Versioned = { id: string; version: number }

/**
 * Lays local edits over a newer copy of the board read from the server: for
 * each element id the higher version wins (local on a tie), and elements that
 * exist on only one side are kept. Server order first, then local-only ones.
 */
export function mergeElements<T extends Versioned>(server: readonly T[], local: readonly T[]): T[] {
  const mine = new Map(local.map((e) => [e.id, e]))
  const merged = server.map((s) => {
    const l = mine.get(s.id)
    return l && l.version >= s.version ? l : s
  })
  const seen = new Set(server.map((s) => s.id))
  return [...merged, ...local.filter((l) => !seen.has(l.id))]
}
