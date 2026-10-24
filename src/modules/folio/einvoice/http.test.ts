import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// A GSP that accepts the connection and then never finishes its reply (slow drip).
class StalledRequest extends EventEmitter {
  destroyed = false
  setTimeout() {
    return this
  }
  end() {
    return this
  }
  destroy(error?: Error) {
    if (this.destroyed) return this
    this.destroyed = true
    if (error) this.emit('error', error)
    this.emit('close')
    return this
  }
}
const requests: StalledRequest[] = []
vi.mock('node:https', () => ({ default: { request: () => { const r = new StalledRequest(); requests.push(r); return r } } }))

afterEach(() => vi.useRealTimers())

describe('GSP client absolute deadline (L12)', () => {
  it('gives up when the reply is still not finished at the deadline, even though data keeps the socket busy', async () => {
    vi.useFakeTimers()
    const { gspPostWithin } = await import('./http')
    const pending = gspPostWithin('https://gsp.example.com/irn', { a: 1 }, {}, 30_000)
    const outcome = pending.then(() => 'resolved', (error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(29_000)
    expect(requests.at(-1)?.destroyed).toBe(false)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(await outcome).toMatch(/within 30 seconds/)
  })

  it('still refuses private and non-https addresses before connecting', async () => {
    const { gspPost } = await import('./http')
    await expect(gspPost('http://gsp.example.com/x', {}, {})).rejects.toThrow(/https/)
    await expect(gspPost('https://127.0.0.1/x', {}, {})).rejects.toThrow(/private|reserved/)
  })
})
