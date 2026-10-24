import { describe, expect, it } from 'vitest'
import { mergeElements } from './merge'

describe('mergeElements', () => {
  it('keeps the higher version of each element, local on a tie', () => {
    const server = [{ id: 'a', version: 3, v: 's' }, { id: 'b', version: 1, v: 's' }]
    const local = [{ id: 'a', version: 2, v: 'l' }, { id: 'b', version: 1, v: 'l' }]
    expect(mergeElements(server, local).map((e) => e.v)).toEqual(['s', 'l'])
  })

  it('keeps elements that exist on only one side, server first', () => {
    const server = [{ id: 'a', version: 1 }, { id: 'saved-on-hide', version: 1 }]
    const local = [{ id: 'a', version: 1 }, { id: 'drawn-after-reload', version: 1 }]
    expect(mergeElements(server, local).map((e) => e.id)).toEqual(['a', 'saved-on-hide', 'drawn-after-reload'])
  })
})
