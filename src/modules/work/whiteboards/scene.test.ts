import { describe, expect, it } from 'vitest'
import { BOARD_BACKGROUND, decodeDataUrl, pickAppState, referencedFileIds, saveSchema } from './scene'

describe('pickAppState', () => {
  it('keeps background and grid, forces dark', () => {
    expect(pickAppState({ viewBackgroundColor: '#ffffff', gridSize: 20, zoom: { value: 2 } })).toEqual({ viewBackgroundColor: '#ffffff', gridSize: 20, theme: 'dark' })
  })
  it('falls back on junk', () => {
    expect(pickAppState({ viewBackgroundColor: 'url(javascript:1)', gridSize: -4 })).toEqual({ viewBackgroundColor: BOARD_BACKGROUND, gridSize: null, theme: 'dark' })
  })
})

describe('referencedFileIds', () => {
  it('collects live image file ids only', () => {
    const ids = referencedFileIds([{ type: 'image', fileId: 'a' }, { type: 'image', fileId: 'b', isDeleted: true }, { type: 'rectangle' }])
    expect([...ids]).toEqual(['a'])
  })
})

describe('decodeDataUrl', () => {
  it('reads base64 data URLs', () => {
    const out = decodeDataUrl(`data:image/png;base64,${Buffer.from('hi').toString('base64')}`)
    expect(out?.mime).toBe('image/png')
    expect(out?.data.toString()).toBe('hi')
    expect(decodeDataUrl('nope')).toBeNull()
  })
})

describe('saveSchema', () => {
  it('accepts a minimal payload and rejects a non-SVG thumbnail', () => {
    expect(saveSchema.safeParse({ version: 0, elements: [] }).success).toBe(true)
    expect(saveSchema.safeParse({ version: 0, elements: [], thumbnail: 'data:text/html,<script>' }).success).toBe(false)
  })
})
