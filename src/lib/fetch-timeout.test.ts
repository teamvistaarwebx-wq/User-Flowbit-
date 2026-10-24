import { describe, expect, it, vi } from 'vitest'
import { BodyTooLargeError, fetchWithTimeout, readBodyCapped, withTimeout } from './fetch-timeout'

/** A fetch that never answers until its signal aborts. */
const hangingFetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  const signal = init?.signal
  signal?.addEventListener('abort', () => reject(signal.reason))
}))

describe('fetchWithTimeout', () => {
  it('aborts a call that does not answer in time', async () => {
    await expect(fetchWithTimeout('https://api.test', {}, 20, hangingFetch)).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('passes the request through and keeps the caller signal', async () => {
    // Arrange
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'))
    const caller = new AbortController()

    // Act
    const res = await withTimeout(fetchImpl, 1000)('https://api.test', { method: 'POST', signal: caller.signal })

    // Assert
    expect(await res.text()).toBe('ok')
    const init = fetchImpl.mock.calls[0][1] ?? {}
    expect(init.method).toBe('POST')
    caller.abort()
    expect(init.signal?.aborted).toBe(true)
  })
})

describe('readBodyCapped', () => {
  it('refuses a declared Content-Length over the cap before reading', async () => {
    const res = new Response('x'.repeat(10), { headers: { 'content-length': '5000' } })
    await expect(readBodyCapped(res, 100)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('stops reading once the bytes pass the cap', async () => {
    await expect(readBodyCapped(new Response('x'.repeat(200)), 100)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('returns the bytes within the cap', async () => {
    expect((await readBodyCapped(new Response('hello'), 100)).toString()).toBe('hello')
  })
})
