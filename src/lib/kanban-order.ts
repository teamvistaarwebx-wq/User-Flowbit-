/** Pure board-drop arithmetic for the Kanban component (client-safe, no React). */

export type BoardItem = { id: string; columnId: string }

export type BoardDrop<T extends BoardItem> = {
  /** The board after the drop: the moved card sits at `toIndex` in `toColumn`. */
  items: T[]
  /** Final position of the moved card inside the target column. */
  toIndex: number
  /** True when the card ends where it started (nothing to save). */
  unchanged: boolean
}

/**
 * The board with `activeId` moved into `toColumn` at `index` (clamped). Used
 * while dragging, so the placeholder sits under the pointer in the hovered column.
 */
export function placeInColumn<T extends BoardItem>(local: T[], activeId: string, toColumn: string, index: number): T[] {
  const moved = local.find((i) => i.id === activeId)
  if (!moved) return local
  const others = local.filter((i) => i.columnId === toColumn && i.id !== activeId)
  const at = Math.max(0, Math.min(index, others.length))
  return [...local.filter((i) => i.columnId !== toColumn && i.id !== activeId), ...others.slice(0, at), { ...moved, columnId: toColumn }, ...others.slice(at)]
}

/**
 * Where a dropped card lands. `local` is the board as shown while dragging (a
 * card dragged into another column already sits there, at the hovered slot),
 * `snapshot` is the board before the drag, and `overId` is the card or column
 * under the pointer. Follows sortable semantics in the target column: the card
 * takes the hovered card's slot, so the drop matches the preview. Dropping on
 * the column itself puts the card last.
 */
export function planBoardDrop<T extends BoardItem>(local: T[], snapshot: T[], activeId: string, overId: string, toColumn: string): BoardDrop<T> | null {
  if (!local.some((i) => i.id === activeId)) return null
  const column = local.filter((i) => i.id === activeId || i.columnId === toColumn)
  const overIndex = column.findIndex((i) => i.id === overId)
  const toIndex = overIndex === -1 ? column.length - 1 : overIndex
  const startIndex = snapshot.filter((i) => i.columnId === toColumn).findIndex((i) => i.id === activeId)
  return { items: placeInColumn(local, activeId, toColumn, toIndex), toIndex, unchanged: startIndex !== -1 && startIndex === toIndex }
}
