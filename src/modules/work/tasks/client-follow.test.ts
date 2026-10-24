import { describe, expect, it } from 'vitest'
import { clientAfterProjectMove } from './client-follow'

describe('clientAfterProjectMove', () => {
  it('replaces a client inherited from the old project with the new project client', () => {
    expect(clientAfterProjectMove('c-old', 'c-old', 'c-new')).toBe('c-new')
  })

  it('gives a task with no client the new project client', () => {
    expect(clientAfterProjectMove(null, null, 'c-new')).toBe('c-new')
  })

  it('clears an inherited client when the new project has none', () => {
    expect(clientAfterProjectMove('c-old', 'c-old', null)).toBeNull()
  })

  it('keeps a client that was set by hand', () => {
    expect(clientAfterProjectMove('c-hand', 'c-old', 'c-new')).toBeUndefined()
    expect(clientAfterProjectMove('c-hand', 'c-old', null)).toBeUndefined()
  })

  it('changes nothing when the client is already right or both are empty', () => {
    expect(clientAfterProjectMove('c-new', 'c-old', 'c-new')).toBeUndefined()
    expect(clientAfterProjectMove(null, null, null)).toBeUndefined()
  })
})
