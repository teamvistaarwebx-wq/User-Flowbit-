import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSideEffects } from './side-effects'

afterEach(() => vi.restoreAllMocks())

describe('runSideEffects', () => {
  it('runs every effect', async () => {
    const a = vi.fn(async () => 'a')
    const b = vi.fn(async () => 'b')
    expect(await runSideEffects('test', [{ label: 'a', run: a }, { label: 'b', run: b }])).toEqual([])
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('keeps going when one fails, and logs the failure with its label', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn(async () => undefined)
    const failed = await runSideEffects('task comment', [
      { label: 'notifications', run: async () => Promise.reject(new Error('mail down')) },
      { label: 'activity', run: after },
    ])
    expect(failed).toEqual(['notifications'])
    expect(after).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('[after:task comment] notifications failed', expect.any(Error))
  })

  it('treats a synchronous throw like a rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = await runSideEffects('x', [{ label: 'boom', run: () => { throw new Error('sync') } }])
    expect(failed).toEqual(['boom'])
  })
})
