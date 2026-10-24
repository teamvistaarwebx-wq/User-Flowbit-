import { describe, expect, it, vi } from 'vitest'
import { createUsageRecorder } from './usage'

describe('recordUsage', () => {
  it('writes the event with a timestamp', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const record = createUsageRecorder(write, vi.fn())

    record({ kind: 'task_created', orgId: 'org1', product: 'work' })

    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toMatchObject({ kind: 'task_created', orgId: 'org1', product: 'work' })
    expect(write.mock.calls[0][0].at).toBeInstanceOf(Date)
  })

  it('never throws when the write rejects, and logs instead', async () => {
    const log = vi.fn()
    const record = createUsageRecorder(() => Promise.reject(new Error('db down')), log)

    expect(() => record({ kind: 'login', userId: 'u1' })).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(log).toHaveBeenCalledWith('[usage] could not record login', expect.any(Error))
  })

  it('never throws when the writer throws synchronously', () => {
    const log = vi.fn()
    const record = createUsageRecorder(() => {
      throw new Error('boom')
    }, log)

    expect(() => record({ kind: 'limit_hit', orgId: 'org1' })).not.toThrow()
    expect(log).toHaveBeenCalledTimes(1)
  })
})
