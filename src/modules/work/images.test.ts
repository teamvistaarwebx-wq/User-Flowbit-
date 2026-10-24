import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({ found: [] as { _id: unknown; name: string; mime: string }[], filter: null as Record<string, unknown> | null }))
vi.mock('@/models/StoredFile', () => ({
  StoredFile: {
    find: (filter: Record<string, unknown>) => {
      h.filter = filter
      return { lean: async () => h.found }
    },
  },
}))
vi.mock('@/lib/files', () => ({ fileUrl: (id: unknown) => `/api/files/${String(id)}`, saveUpload: vi.fn() }))

const { claimImages, imagesView, uploadInlineImage } = await import('./images')

const orgId = new Types.ObjectId()
const userId = new Types.ObjectId()
const ctx = { orgId, userId } as never
const a = new Types.ObjectId()
const b = new Types.ObjectId()

describe('claimImages', () => {
  it('only takes this person’s uploads of the right kind in this workspace (and task)', async () => {
    h.found = [{ _id: a, name: 'a.png', mime: 'image/png' }]
    const taskId = new Types.ObjectId()
    expect(await claimImages(ctx, [String(a)], { kind: 'comment_image', entityId: taskId })).toEqual([{ fileId: a, name: 'a.png', mime: 'image/png' }])
    expect(h.filter).toMatchObject({ orgId, uploadedBy: userId, kind: 'comment_image', entityId: String(taskId) })
  })

  it('refuses an id that is not such a file (someone else’s, another kind or workspace)', async () => {
    h.found = [{ _id: a, name: 'a.png', mime: 'image/png' }]
    await expect(claimImages(ctx, [String(a), String(b)], { kind: 'post_image' })).rejects.toThrow(/could not be attached/)
  })

  it('refuses more than four', async () => {
    const ids = Array.from({ length: 5 }, () => String(new Types.ObjectId()))
    await expect(claimImages(ctx, ids, { kind: 'post_image' })).rejects.toThrow(/Up to 4/)
  })

  it('takes none without touching the database', async () => {
    h.filter = null
    expect(await claimImages(ctx, [], { kind: 'post_image' })).toEqual([])
    expect(h.filter).toBeNull()
  })
})

describe('uploadInlineImage', () => {
  it('refuses an SVG before storing anything', async () => {
    const file = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })
    await expect(uploadInlineImage(ctx, file, { kind: 'post_image', entity: 'Post' })).rejects.toThrow(/not a JPEG/)
  })
})

describe('imagesView', () => {
  it('links each image through the tenancy-checked file route', () => {
    expect(imagesView([{ fileId: a, name: 'a.png' }])).toEqual([{ id: String(a), url: `/api/files/${a}`, name: 'a.png' }])
    expect(imagesView(undefined)).toEqual([])
  })
})
