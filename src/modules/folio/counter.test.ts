import { Types } from 'mongoose'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const nextSeq = vi.fn()
vi.mock('@/lib/sequence', () => ({ nextSeq: (...args: unknown[]) => nextSeq(...args), peekSeq: vi.fn() }))

const { takeNumber } = await import('./counter')

const orgId = new Types.ObjectId()
const entity = (series: Record<string, unknown>) => ({
  _id: new Types.ObjectId(),
  series: { invoicePrefix: 'VWX', creditNotePrefix: 'VWXCN', receiptPrefix: 'VWXRC', quotePrefix: 'VWX-QUOTE', proformaPrefix: 'VWXPI', padding: 4, fyFormat: 'short' as const, ...series },
})

describe('takeNumber 16-character limit', () => {
  beforeEach(() => nextSeq.mockReset())

  test('issues a short-year number that fits', async () => {
    nextSeq.mockResolvedValue(7)
    await expect(takeNumber(orgId, entity({}), 'credit_note', '2026-10-01')).resolves.toMatchObject({ number: 'VWXCN/26-27/0007', fyLabel: '2026-27', seq: 7 })
  })

  test('refuses a credit-note series that is too long before spending a number', async () => {
    // Arrange
    const old = entity({ creditNotePrefix: 'VWX-CN', fyFormat: undefined })
    // Act
    const taking = takeNumber(orgId, old, 'credit_note', '2026-10-01')
    // Assert
    await expect(taking).rejects.toThrow(/19 characters, but GST allows at most 16/)
    expect(nextSeq).not.toHaveBeenCalled()
  })

  test('refuses an invoice number once the sequence outgrows its padding', async () => {
    nextSeq.mockResolvedValue(100000)
    await expect(takeNumber(orgId, entity({ invoicePrefix: 'ACMEI' }), 'invoice', '2026-10-01')).rejects.toThrow(/ACMEI\/26-27\/100000 is 18 characters/)
  })

  test('still numbers a long quote series, which is not a GST document', async () => {
    nextSeq.mockResolvedValue(1)
    await expect(takeNumber(orgId, entity({}), 'quote', '2026-10-01')).resolves.toMatchObject({ number: 'VWX-QUOTE/26-27/0001' })
  })
})
