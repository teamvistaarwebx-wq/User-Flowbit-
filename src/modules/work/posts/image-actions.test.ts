import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({
  limited: false,
  keys: [] as string[],
  download: vi.fn(async () => Buffer.from('GIF89a')),
  upload: vi.fn(async () => ({ id: 'f1', url: '/api/files/f1', name: 'cat.gif' })),
}))

const memberId = new Types.ObjectId()
const ctx = { memberId, orgId: new Types.ObjectId(), has: () => true, can: () => true, assert: () => {}, assertProduct: () => {}, assertWritable: () => {}, hasFeature: () => true, canAny: () => true }

vi.mock('@/lib/ctx', () => ({ getCtx: async () => ctx, isBlocked: () => false }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/env', () => ({ serverEnv: () => ({ KLIPY_API_KEY: 'test-key' }) }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async (key: string) => {
    h.keys.push(key)
    return h.limited ? { ok: false, retryAfterSeconds: 42 } : { ok: true, retryAfterSeconds: 0 }
  },
}))
vi.mock('../images', () => ({ uploadInlineImage: h.upload }))
vi.mock('./gifs', () => ({ downloadGif: h.download, gifFileName: () => 'cat.gif' }))

const { attachPostGif } = await import('./image-actions')

describe('attachPostGif', () => {
  beforeEach(() => {
    h.limited = false
    h.keys.length = 0
    h.download.mockClear()
    h.upload.mockClear()
  })

  it('copies a picked GIF while the member is under the per-minute limit', async () => {
    const result = await attachPostGif({ url: 'https://static.klipy.com/a.gif', title: 'Cat' })
    expect(result.ok).toBe(true)
    expect(h.keys).toEqual([`gifAttach:${memberId}`])
    expect(h.download).toHaveBeenCalledTimes(1)
  })

  it('refuses before fetching anything once the member is over the limit', async () => {
    h.limited = true
    const result = await attachPostGif({ url: 'https://static.klipy.com/a.gif', title: 'Cat' })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? '' : result.error).toMatch(/Too many GIFs/)
    expect(h.download).not.toHaveBeenCalled()
    expect(h.upload).not.toHaveBeenCalled()
  })
})
