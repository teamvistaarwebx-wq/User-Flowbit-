import { describe, expect, it } from 'vitest'
import { mediaGrid } from './media-grid'

describe('post media grid', () => {
  it('lays out one to four images, and folds the rest into +N', () => {
    expect(mediaGrid(0).tiles).toEqual([])
    expect(mediaGrid(1).tiles).toHaveLength(1)
    expect(mediaGrid(2).container).toContain('grid-cols-2')
    expect(mediaGrid(3).tiles[0].className).toContain('row-span-2')
    expect(mediaGrid(4).tiles.map((t) => t.more)).toEqual([0, 0, 0, 0])
    expect(mediaGrid(6).tiles.map((t) => t.more)).toEqual([0, 0, 0, 2])
  })
})
