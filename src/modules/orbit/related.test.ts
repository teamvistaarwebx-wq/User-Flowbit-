import { Types } from 'mongoose'
import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { resolveRelated } = await import('./related')

const clientId = new Types.ObjectId()
const ownContact = new Types.ObjectId()

/** A ctx whose Client collection holds one client with one contact. */
function fakeCtx() {
  const exists = vi.fn(async (filter: { _id: unknown; 'contacts._id': unknown }) => (String(filter._id) === String(clientId) && String(filter['contacts._id']) === String(ownContact) ? { _id: clientId } : null))
  const db = () => ({
    findById: () => ({ lean: async () => ({ _id: clientId, name: 'Acme' }) }),
    exists,
  })
  return { ctx: { assert: () => undefined, memberId: new Types.ObjectId(), db } as never, exists }
}

describe('resolveRelated contact check', () => {
  test("accepts one of the client's own contacts", async () => {
    const { ctx } = fakeCtx()
    await expect(resolveRelated(ctx, { clientId: String(clientId), contactId: String(ownContact) })).resolves.toMatchObject({ contactId: String(ownContact) })
  })

  test("refuses another client's contact", async () => {
    // Arrange
    const { ctx } = fakeCtx()
    // Act
    const resolving = resolveRelated(ctx, { clientId: String(clientId), contactId: String(new Types.ObjectId()) })
    // Assert
    await expect(resolving).rejects.toThrow('That contact is not on this client.')
  })

  test('refuses a malformed contact id without querying', async () => {
    const { ctx, exists } = fakeCtx()
    await expect(resolveRelated(ctx, { clientId: String(clientId), contactId: 'nope' })).rejects.toThrow(/not on this client/)
    expect(exists).not.toHaveBeenCalled()
  })
})
