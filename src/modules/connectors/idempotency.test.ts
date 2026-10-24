import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'
import { onceForKey } from './idempotency'

/** An McpIdempotency table with the unique key index. */
function fakeDb() {
  const rows: { key: string; recordId: Types.ObjectId; label?: string }[] = []
  const table = {
    create: async (doc: { key: string; recordId: Types.ObjectId }) => {
      if (rows.some((r) => r.key === doc.key)) throw Object.assign(new Error('E11000'), { code: 11000 })
      rows.push({ ...doc })
      return doc
    },
    findOne: (f: { key: string }) => ({ lean: async () => rows.find((r) => r.key === f.key) ?? null }),
    updateOne: async (f: { key: string; recordId: Types.ObjectId }, u: { $set: { recordId: Types.ObjectId; label: string } }) => {
      const row = rows.find((r) => r.key === f.key && r.recordId.equals(f.recordId))
      if (row) Object.assign(row, u.$set)
      return { modifiedCount: row ? 1 : 0 }
    },
    deleteOne: async (f: { key: string; recordId: Types.ObjectId }) => {
      const at = rows.findIndex((r) => r.key === f.key && r.recordId.equals(f.recordId))
      if (at >= 0) rows.splice(at, 1)
      return { deletedCount: at >= 0 ? 1 : 0 }
    },
  }
  return { rows, ctx: { db: () => table } as never }
}

const task = () => ({ _id: new Types.ObjectId(), title: 'Banner' })

describe('onceForKey (L-27a)', () => {
  it('creates one task for two concurrent deliveries of the same message', async () => {
    // Arrange
    const { rows, ctx } = fakeDb()
    const create = vi.fn(async () => task())

    // Act
    const [a, b] = await Promise.all([onceForKey(ctx, 'email:<m1@x>', create), onceForKey(ctx, 'email:<m1@x>', create)])

    // Assert
    expect(create).toHaveBeenCalledTimes(1)
    expect([a, b].filter((r) => 'duplicate' in r)).toHaveLength(1)
    const created = [a, b].find((r) => 'created' in r) as { created: { _id: Types.ObjectId } }
    expect(String(rows[0].recordId)).toBe(String(created.created._id))
  })

  it('frees the key when creating the task fails, so a redelivery can create it', async () => {
    const { rows, ctx } = fakeDb()
    await expect(onceForKey(ctx, 'slack:1', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(rows).toHaveLength(0)
    await expect(onceForKey(ctx, 'slack:1', async () => task())).resolves.toHaveProperty('created')
  })

  it('creates without a claim when there is no key', async () => {
    const { rows, ctx } = fakeDb()
    await onceForKey(ctx, null, async () => task())
    expect(rows).toHaveLength(0)
  })
})
