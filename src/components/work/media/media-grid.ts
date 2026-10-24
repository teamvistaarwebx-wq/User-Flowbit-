/**
 * The feed's media grid (pure): one image wide (16:9), two side by side,
 * three as one tall plus two stacked, four as a 2 × 2 grid. More than four
 * shows the first four with "+N" on the last tile.
 */

export const MAX_GRID_TILES = 4

export type GridTile = Readonly<{ index: number; className: string; more: number }>

export function mediaGrid(count: number): Readonly<{ container: string; tiles: GridTile[] }> {
  const shown = Math.min(count, MAX_GRID_TILES)
  const more = Math.max(0, count - MAX_GRID_TILES)
  const tile = (index: number, className: string): GridTile => ({ index, className, more: index === shown - 1 ? more : 0 })
  if (shown <= 0) return { container: '', tiles: [] }
  if (shown === 1) return { container: 'grid grid-cols-1', tiles: [tile(0, 'aspect-video')] }
  if (shown === 2) return { container: 'grid grid-cols-2 gap-1.5', tiles: [tile(0, 'aspect-[4/5] sm:aspect-square'), tile(1, 'aspect-[4/5] sm:aspect-square')] }
  if (shown === 3) return { container: 'grid grid-cols-2 grid-rows-2 gap-1.5 aspect-[4/3] sm:aspect-video', tiles: [tile(0, 'row-span-2'), tile(1, ''), tile(2, '')] }
  return { container: 'grid grid-cols-2 gap-1.5', tiles: [0, 1, 2, 3].map((i) => tile(i, 'aspect-video')) }
}
