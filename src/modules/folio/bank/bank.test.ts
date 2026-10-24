import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modeOf, payeeOf, suggestCategory } from './categorise'
import { confidenceOf, extractUtrs, scoreInvoice, suggestMatches, type OpenInvoice } from './match'
import { mapFromPicks, parseAmountPaise, parseStatement, parseStatementDate } from './parse'
import { detectHeader, mappingProblem } from './presets'

vi.mock('server-only', () => ({}))

const ENTITY = 'eeeeeeeeeeeeeeeeeeeeeeee'
const preamble = [['Account Statement'], ['Account No : 50100123456789'], [''], ['Statement From : 01/10/2026 To : 08/10/2026']]

describe('bank presets', () => {
  it('HDFC: finds the header under the preamble, skips the asterisk row and the closing totals', () => {
    const rows = [
      ...preamble,
      ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
      ['********', '********', '********', '********', '********', '********', '********'],
      ['01/10/26', 'NEFT CR-ICIC0000104-ACME DESIGNS PVT LTD-INV/024/2026-27', 'ICICN52026100112345', '01/10/26', '', '1,18,000.00', '2,18,000.00'],
      ['02/10/26', 'UPI-SHARMA PRINTERS-sharmaprint@okaxis-412345678901-PAYMENT', '412345678901', '02/10/26', '4,500.00', '', '2,13,500.00'],
      ['', 'STATEMENT SUMMARY', '', '', '4,500.00', '1,18,000.00', ''],
    ]
    const parsed = parseStatement(rows, ENTITY)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.preset).toBe('hdfc')
    expect(parsed.headerRow).toBe(4)
    expect(parsed.txns).toHaveLength(2)
    expect(parsed.txns[0]).toMatchObject({ date: '2026-10-01', direction: 'credit', amountPaise: 11_800_000, balancePaise: 21_800_000, reference: 'ICICN52026100112345', line: 7 })
    expect(parsed.txns[1]).toMatchObject({ date: '2026-10-02', direction: 'debit', amountPaise: 450_000 })
    expect(parsed.skipped).toBe(2)
  })

  it('ICICI: prefers the transaction date and reads the INR columns', () => {
    const rows = [['S No.', 'Value Date', 'Transaction Date', 'Cheque Number', 'Transaction Remarks', 'Withdrawal Amount (INR )', 'Deposit Amount (INR )', 'Balance (INR )'], ['1', '03/10/2026', '02/10/2026', '-', 'IMPS/P2A/627512345678/KALPA STUDIO', '0.00', '25,000.00', '1,25,000.00']]
    const parsed = parseStatement(rows, ENTITY)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.preset).toBe('icici')
    expect(parsed.txns[0]).toMatchObject({ date: '2026-10-02', direction: 'credit', amountPaise: 2_500_000 })
  })

  it('SBI: "1 Oct 2026" dates and Debit / Credit columns', () => {
    const rows = [['Txn Date', 'Value Date', 'Description', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance'], ['1 Oct 2026', '1 Oct 2026', 'BY TRANSFER-NEFT*HDFC0000001*N123*MEHTA EXPORTS', 'TRANSFER FROM 9876', ' ', '59,000.00', '1,59,000.00']]
    const parsed = parseStatement(rows, ENTITY)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.preset).toBe('sbi')
    expect(parsed.txns[0]).toMatchObject({ date: '2026-10-01', direction: 'credit', amountPaise: 5_900_000 })
  })

  it('Axis: DR / CR columns', () => {
    const rows = [['Tran Date', 'CHQNO', 'PARTICULARS', 'DR', 'CR', 'BAL', 'SOL'], ['05-10-2026', '', 'GST CHARGES ON IMPS', '5.90', '', '99,994.10', '123']]
    const parsed = parseStatement(rows, ENTITY)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.preset).toBe('axis')
    expect(parsed.txns[0]).toMatchObject({ date: '2026-10-05', direction: 'debit', amountPaise: 590 })
  })

  it('Kotak: one Amount column with Dr / Cr', () => {
    const rows = [['Sl. No.', 'Transaction Date', 'Value Date', 'Description', 'Chq / Ref No.', 'Amount', 'Dr / Cr', 'Balance', 'Dr / Cr'], ['1', '06-Oct-2026', '06-Oct-2026', 'NEFT-ACME', 'N1', '10,000.00', 'CR', '50,000.00', 'CR'], ['2', '07-Oct-2026', '07-Oct-2026', 'RENT OCT', 'C2', '20,000.00', 'DR', '30,000.00', 'CR']]
    const parsed = parseStatement(rows, ENTITY)
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.preset).toBe('kotak')
    expect(parsed.txns.map((t) => [t.direction, t.amountPaise])).toEqual([['credit', 1_000_000], ['debit', 2_000_000]])
  })

  it('generic: any bank with a signed amount, or the person\'s own column picks', () => {
    const rows = [['Posting Date', 'Details', 'Transaction Amount'], ['2026-10-01', 'Client payment', '5000'], ['2026-10-02', 'Card spend', '-250.50']]
    const parsed = parseStatement(rows, ENTITY, { preset: 'generic' })
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.txns.map((t) => [t.direction, t.amountPaise])).toEqual([['credit', 500_000], ['debit', 25_050]])
    const odd = [['When', 'What', 'In', 'Out'], ['01/10/2026', 'x', '100', '']]
    expect(detectHeader(odd)).toBeNull()
    expect(parseStatement(odd, ENTITY)).toMatchObject({ error: expect.stringMatching(/Other bank/) })
    const map = mapFromPicks(odd[0], { date: 'When', narration: 'What', credit: 'In', debit: 'Out' })
    expect(mappingProblem(map)).toBeNull()
    const picked = parseStatement(odd, ENTITY, { map })
    expect('error' in picked ? picked.error : picked.txns[0].amountPaise).toBe(10_000)
  })

  it('reads dates and money the way Indian banks print them', () => {
    expect(parseStatementDate('05/10/26')).toBe('2026-10-05')
    expect(parseStatementDate('05-OCT-2026')).toBe('2026-10-05')
    expect(parseStatementDate('5 Sept 2026')).toBe('2026-09-05')
    expect(parseStatementDate('2026-10-05 10:31')).toBe('2026-10-05')
    expect(parseStatementDate('31/02/2026')).toBeNull()
    expect(parseStatementDate('Opening balance')).toBeNull()
    expect(parseAmountPaise('1,23,456.78')).toMatchObject({ paise: 12_345_678, sign: 1 })
    expect(parseAmountPaise('₹ 500')).toMatchObject({ paise: 50_000 })
    expect(parseAmountPaise('(250.5)')).toMatchObject({ paise: 25_050, sign: -1 })
    expect(parseAmountPaise('1,000.00 Dr')).toMatchObject({ paise: 100_000, marker: 'dr' })
    expect(parseAmountPaise('0.1')).toMatchObject({ paise: 10 })
    expect(parseAmountPaise('abc')).toBeNull()
  })
})

describe('dedupe', () => {
  const rows = [['Date', 'Narration', 'Deposit Amt.'], ['01/10/2026', 'UPI FROM RAHUL', '500'], ['01/10/2026', 'UPI FROM RAHUL', '500'], ['01/10/2026', 'UPI FROM PRIYA', '500']]

  it('the same file gives the same hashes; two identical rows in one file stay two', () => {
    const a = parseStatement(rows, ENTITY)
    const b = parseStatement(rows, ENTITY)
    if ('error' in a || 'error' in b) throw new Error('parse')
    expect(a.txns.map((t) => t.rowHash)).toEqual(b.txns.map((t) => t.rowHash))
    expect(new Set(a.txns.map((t) => t.rowHash)).size).toBe(3)
  })

  it('another entity or a different row hashes differently', () => {
    const a = parseStatement(rows, ENTITY)
    const other = parseStatement(rows, 'ffffffffffffffffffffffff')
    if ('error' in a || 'error' in other) throw new Error('parse')
    expect(a.txns[0].rowHash).not.toBe(other.txns[0].rowHash)
  })
})

const invoice = (over: Partial<OpenInvoice> = {}): OpenInvoice => ({
  id: 'i1', number: 'INV/024/2026-27', clientId: 'c1', clientName: 'Acme Designs Pvt Ltd', entityId: ENTITY,
  balancePaise: 11_800_000, subtotalPaise: 10_000_000, issueDate: '2026-09-15', dueDate: '2026-09-30', utrs: [], ...over,
})

describe('match scoring', () => {
  it('amount, invoice number, client name and date add up to high confidence', () => {
    const s = scoreInvoice({ date: '2026-10-01', amountPaise: 11_800_000, narration: 'NEFT CR-ICIC0000104-ACME DESIGNS PVT LTD-INV/024/2026-27', reference: '' }, invoice())
    expect(s.score).toBe(100)
    expect(s.confidence).toBe('high')
    expect(s.reasons).toEqual(expect.arrayContaining(['Amount matches the balance', 'INV/024/2026-27 in the narration']))
    expect(s).toMatchObject({ amountPaise: 11_800_000, tdsPaise: 0 })
  })

  it('a credit up to a rupee short is labelled as leaving the paise open, not as matching the balance (6.10)', () => {
    const s = scoreInvoice({ date: '2026-10-01', amountPaise: 11_799_960, narration: 'NEFT ACME DESIGNS', reference: '' }, invoice())
    expect(s.reasons).not.toContain('Amount matches the balance')
    expect(s.reasons.join(' ')).toMatch(/short of the balance; that stays open/)
    expect(s).toMatchObject({ amountPaise: 11_799_960, tdsPaise: 0 })
  })

  it('a credit up to a rupee over still matches, the rest as advance', () => {
    const s = scoreInvoice({ date: '2026-10-01', amountPaise: 11_800_050, narration: '', reference: '' }, invoice())
    expect(s.reasons).toContain('Amount matches the balance')
    expect(s.amountPaise).toBe(11_800_000)
  })

  it('balance less 10% TDS on the taxable value closes the invoice with the TDS', () => {
    const s = scoreInvoice({ date: '2026-10-01', amountPaise: 10_800_000, narration: 'NEFT ACME DESIGNS', reference: '' }, invoice())
    expect(s.reasons).toContain('Balance less 10% TDS')
    expect(s.amountPaise + s.tdsPaise).toBe(11_800_000)
    expect(s.tdsPaise).toBe(1_000_000)
    const two = scoreInvoice({ date: '2026-10-01', amountPaise: 11_600_000, narration: 'x', reference: '' }, invoice())
    expect(two.reasons).toContain('Balance less 2% TDS')
    expect(two.tdsPaise).toBe(200_000)
  })

  it('a UTR the client shared on the invoice link is strong evidence', () => {
    const s = scoreInvoice({ date: '2026-10-01', amountPaise: 5_000_000, narration: 'IMPS/627512345678/XYZ', reference: '' }, invoice({ utrs: ['6275 1234 5678'] }))
    expect(s.reasons).toContain('UTR the client shared on the invoice link')
    expect(s.confidence).toBe('medium')
  })

  it('money before the invoice was issued counts against it; weak guesses are dropped', () => {
    const early = scoreInvoice({ date: '2026-09-01', amountPaise: 11_800_000, narration: 'x', reference: '' }, invoice())
    expect(early.reasons).toContain('Received before the invoice date')
    const none = suggestMatches({ date: '2026-10-01', amountPaise: 123_400, narration: 'CASH DEPOSIT', reference: '' }, [invoice()])
    expect(none).toEqual([])
  })

  it('ranks the best invoice first and caps the list', () => {
    const list = suggestMatches({ date: '2026-10-01', amountPaise: 5_900_000, narration: 'NEFT MEHTA EXPORTS', reference: '' }, [
      invoice(),
      invoice({ id: 'i2', number: 'INV/030/2026-27', clientName: 'Mehta Exports', clientId: 'c2', balancePaise: 5_900_000, subtotalPaise: 5_000_000 }),
      invoice({ id: 'i3', number: 'INV/031/2026-27', clientName: 'Mehta Exports', clientId: 'c2', balancePaise: 900_000, subtotalPaise: 762_712 }),
      invoice({ id: 'i4', number: 'INV/032/2026-27', clientName: 'Mehta Exports', clientId: 'c2', balancePaise: 100_000, subtotalPaise: 84_746 }),
      invoice({ id: 'i5', number: 'INV/033/2026-27', clientName: 'Mehta Exports', clientId: 'c2', balancePaise: 200_000, subtotalPaise: 169_492 }),
    ])
    expect(list[0].invoiceId).toBe('i2')
    expect(list.length).toBeLessThanOrEqual(3)
    expect(confidenceOf(80)).toBe('high')
    expect(confidenceOf(50)).toBe('medium')
    expect(confidenceOf(20)).toBe('low')
  })

  it('pulls UTRs out of narrations', () => {
    expect(extractUtrs('UPI/412345678901/SHARMA')).toEqual(['412345678901'])
    expect(extractUtrs('NEFT CR-ICICN52026100112345-ACME')).toContain('ICICN52026100112345')
  })
})

describe('debits to expenses', () => {
  const categories = ['Rent', 'Software & subscriptions', 'Travel', 'Marketing', 'Bank charges', 'Taxes & fees', 'Office & utilities', 'Other'].map((name, i) => ({ id: String(i), name }))

  it('suggests a category from the narration, Other when nothing fits', () => {
    expect(suggestCategory('ACH D- GOOGLE ADS', categories)?.name).toBe('Marketing')
    expect(suggestCategory('POS AWS EMEA', categories)?.name).toBe('Software & subscriptions')
    expect(suggestCategory('NEFT RENT OCT 2026 LANDLORD', categories)?.name).toBe('Rent')
    expect(suggestCategory('UPI-UBER INDIA', categories)?.name).toBe('Travel')
    expect(suggestCategory('GST PMT CHALLAN 2610', categories)?.name).toBe('Taxes & fees')
    expect(suggestCategory('SMS ALERT CHARGES', categories)?.name).toBe('Bank charges')
    expect(suggestCategory('RANDOM TEXT', categories)?.name).toBe('Other')
    expect(suggestCategory('RANDOM', [])).toBeNull()
  })

  it('reads the mode and a payee', () => {
    expect(modeOf('UPI/412345678901/SHARMA PRINTERS/okaxis')).toBe('upi')
    expect(modeOf('NEFT DR-HDFC0000001-RAVI')).toBe('bank_transfer')
    expect(modeOf('ACH D- HDFC LIFE')).toBe('auto_debit')
    expect(modeOf('POS 4321 AMAZON')).toBe('card')
    expect(payeeOf('UPI/412345678901/SHARMA PRINTERS/okaxis')).toBe('Sharma Printers')
    expect(payeeOf('NEFT DR-HDFC0000001-RAVI KUMAR-N1234')).toBe('Ravi Kumar')
  })
})

// --- Confirm → receipt, and undo, with the receipt service and the database faked -----------------

const recordReceipt = vi.fn()
const closeReceipt = vi.fn()
vi.mock('@/modules/folio/receipts/service', () => ({ recordReceipt: (...a: unknown[]) => recordReceipt(...a), closeReceipt: (...a: unknown[]) => closeReceipt(...a) }))
vi.mock('@/lib/xlsx-read', () => ({ readXlsx: () => [] }))

type Row = Record<string, unknown> & { _id: string }
const tables: Record<string, Row[]> = {}
const cmp = (a: unknown) => (a instanceof Date ? a.getTime() : a) as number
const matches = (row: Row, filter: Record<string, unknown>): boolean =>
  Object.entries(filter).every(([k, v]) => {
    if (k === '$or') return (v as Record<string, unknown>[]).some((f) => matches(row, f))
    if (v === null) return row[k] === null || row[k] === undefined
    if (v && typeof v === 'object' && '$in' in (v as object)) return ((v as { $in: unknown[] }).$in).map(String).includes(String(row[k]))
    if (v && typeof v === 'object' && '$lt' in (v as object)) return row[k] != null && cmp(row[k]) < cmp((v as { $lt: unknown }).$lt)
    if (v && typeof v === 'object' && '$gte' in (v as object)) return row[k] != null && cmp(row[k]) >= cmp((v as { $gte: unknown }).$gte)
    return String(row[k]) === String(v)
  })
const fakeDb = (model: { modelName: string }) => {
  const rows = (tables[model.modelName] ??= [])
  const one = (f: Record<string, unknown>) => rows.find((r) => matches(r, f)) ?? null
  return {
    findById: (id: string) => ({ lean: async () => one({ _id: id }) }),
    findOne: (f: Record<string, unknown>) => ({ lean: async () => one(f) }),
    find: (f: Record<string, unknown>) => ({ lean: async () => rows.filter((r) => matches(r, f)) }),
    exists: async (f: Record<string, unknown>) => one(f),
    findOneAndUpdate: (f: Record<string, unknown>, u: { $set: Record<string, unknown> }) => ({ lean: async () => { const r = one(f); if (r) Object.assign(r, u.$set); return r } }),
    updateOne: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown> }) => { const r = one(f); if (r && u.$set) Object.assign(r, u.$set); return { modifiedCount: r ? 1 : 0 } },
    updateMany: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown> }) => { const hit = rows.filter((r) => matches(r, f)); for (const r of hit) Object.assign(r, u.$set); return { modifiedCount: hit.length } },
    deleteOne: async (f: Record<string, unknown>) => { const i = rows.findIndex((r) => matches(r, f)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 } },
    deleteMany: async (f: Record<string, unknown>) => { const before = rows.length; tables[model.modelName] = rows.filter((r) => !matches(r, f)); return { deletedCount: before - tables[model.modelName].length } },
  }
}
const perms = { denied: new Set<string>() }
const ctx = { db: fakeDb, orgId: 'o1', memberId: 'm1', user: { name: 'Neha' }, can: (p: string) => !perms.denied.has(p) } as never

describe('confirm a match → receipt', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k]
    tables.BankTxn = [{ _id: 't1', entityId: ENTITY, bankAccountId: null, date: '2026-10-01', narration: 'NEFT CR-ICICN52026100112345-ACME', reference: '', direction: 'credit', amountPaise: 12_000_000, status: 'unmatched', statementId: 's1' }]
    tables.Invoice = [{ _id: 'i1', clientId: 'c1', entityId: ENTITY, number: 'INV/024/2026-27' }]
    tables.BankStatement = [{ _id: 's1', status: 'done', undoUntil: new Date(Date.now() + 86_400_000) }]
    recordReceipt.mockReset().mockResolvedValue({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', number: 'RCT/001', allocatedPaise: 11_800_000, unallocatedPaise: 200_000 })
    closeReceipt.mockReset().mockResolvedValue({})
  })

  it('records the receipt with the allocation and the UTR, and marks the row matched', async () => {
    const { confirmMatch } = await import('./service')
    const out = await confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0, score: 92 })
    expect(recordReceipt).toHaveBeenCalledWith(ctx, expect.objectContaining({ clientId: 'c1', entityId: ENTITY, amountPaise: 12_000_000, mode: 'bank_transfer', reference: 'ICICN52026100112345', receivedOn: '2026-10-01', allocations: [{ invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0 }] }))
    expect(out.allocatedPaise).toBe(11_800_000)
    expect(tables.BankTxn[0]).toMatchObject({ status: 'matched', matchScore: 92 })
  })

  it('a second confirm of the same row is refused (no second receipt)', async () => {
    const { confirmMatch } = await import('./service')
    await confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0, score: 92 })
    await expect(confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0, score: 92 })).rejects.toThrow(/already matched/)
    expect(recordReceipt).toHaveBeenCalledTimes(1)
  })

  it('a refused receipt puts the row back in the queue', async () => {
    recordReceipt.mockRejectedValueOnce(new Error('Invoice INV/024 has only ₹10 outstanding.'))
    const { confirmMatch } = await import('./service')
    await expect(confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0, score: null })).rejects.toThrow(/outstanding/)
    expect(tables.BankTxn[0].status).toBe('unmatched')
  })

  it('refuses an invoice from another entity', async () => {
    tables.Invoice = [{ _id: 'i1', clientId: 'c1', entityId: 'ffffffffffffffffffffffff', number: 'X' }]
    const { confirmMatch } = await import('./service')
    await expect(confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 1, tdsPaise: 0, score: null })).rejects.toThrow(/another entity/)
    expect(recordReceipt).not.toHaveBeenCalled()
  })

  it('undo cancels the receipts, deletes the expenses and rows, once, within 7 days', async () => {
    const { confirmMatch, undoStatement } = await import('./service')
    await confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0, score: 92 })
    tables.BankTxn.push({ _id: 't2', statementId: 's1', status: 'expense', expenseId: 'x1', direction: 'debit' })
    tables.FolioExpense = [{ _id: 'x1' }]
    tables.BankStatement = [{ _id: 's1', status: 'done', undoUntil: new Date(Date.now() + 86_400_000) }]
    const out = await undoStatement(ctx, 's1')
    expect(out).toEqual({ rows: 2, receipts: 1, expenses: 1 })
    expect(closeReceipt).toHaveBeenCalledWith(ctx, 'aaaaaaaaaaaaaaaaaaaaaaaa', { status: 'cancelled', reason: 'Bank statement import undone' })
    expect(tables.BankTxn).toEqual([])
    expect(tables.BankStatement[0].status).toBe('undone')
    await expect(undoStatement(ctx, 's1')).rejects.toThrow(/already undone/)
    tables.BankStatement = [{ _id: 's2', status: 'done', undoUntil: new Date(Date.now() - 1000) }]
    await expect(undoStatement(ctx, 's2')).rejects.toThrow(/7 days/)
  })

  it('undo refuses to delete booked expenses without the expense permission (night check)', async () => {
    const { undoStatement } = await import('./service')
    tables.BankTxn = [{ _id: 't2', statementId: 's1', status: 'expense', expenseId: 'x1', direction: 'debit' }]
    tables.FolioExpense = [{ _id: 'x1' }]
    tables.BankStatement = [{ _id: 's1', status: 'done', undoUntil: new Date(Date.now() + 86_400_000) }]
    perms.denied = new Set(['expenses.write'])
    try {
      await expect(undoStatement(ctx, 's1')).rejects.toThrow(/permission to edit expenses/)
      expect(tables.FolioExpense).toHaveLength(1)
      expect(tables.BankStatement[0].status).toBe('done')
    } finally {
      perms.denied = new Set()
    }
  })

  it('releases a row stuck in matching after a crash, and lets it be matched again (L10)', async () => {
    const { confirmMatch, releaseStuckRows, STALE_CLAIM_MS } = await import('./service')
    Object.assign(tables.BankTxn[0], { status: 'matching', claimToken: 'dead', claimedAt: new Date(Date.now() - STALE_CLAIM_MS - 1000) })
    tables.BankTxn.push({ _id: 't9', status: 'matching', claimToken: 'live', claimedAt: new Date(), direction: 'credit', statementId: 's1' })
    expect(await releaseStuckRows(ctx)).toBe(1)
    expect(tables.BankTxn[0]).toMatchObject({ status: 'unmatched', claimToken: null })
    expect(tables.BankTxn[1].status).toBe('matching')
    Object.assign(tables.BankTxn[0], { status: 'matching', claimToken: 'dead', claimedAt: new Date(Date.now() - STALE_CLAIM_MS - 1000) })
    await confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 11_800_000, tdsPaise: 0, score: 80 })
    expect(tables.BankTxn[0]).toMatchObject({ status: 'matched', claimToken: null })
  })

  it('refuses to match a row of a statement being undone, and gives the row back (L10)', async () => {
    tables.BankStatement[0].status = 'undoing'
    const { confirmMatch } = await import('./service')
    await expect(confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 1, tdsPaise: 0, score: null })).rejects.toThrow(/being undone/)
    expect(recordReceipt).not.toHaveBeenCalled()
    expect(tables.BankTxn[0].status).toBe('unmatched')
  })

  it('an undo racing a match leaves no orphan receipt: the lost claim cancels its receipt (L10)', async () => {
    const { confirmMatch, undoStatement } = await import('./service')
    recordReceipt.mockImplementationOnce(async () => {
      // The claim is taken over while the receipt is written (e.g. it went stale and the undo removed the row).
      tables.BankTxn = []
      return { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', number: 'RCT/002' }
    })
    await expect(confirmMatch(ctx, { txnId: 't1', invoiceId: 'i1', amountPaise: 1, tdsPaise: 0, score: null })).rejects.toThrow(/changed while it was being matched/)
    expect(closeReceipt).toHaveBeenCalledWith(ctx, 'bbbbbbbbbbbbbbbbbbbbbbbb', expect.objectContaining({ status: 'cancelled' }))
    tables.BankTxn = [{ _id: 't3', statementId: 's1', status: 'matching', claimToken: 'x', claimedAt: new Date(), direction: 'credit' }]
    await expect(undoStatement(ctx, 's1')).rejects.toThrow(/being matched right now/)
    expect(tables.BankStatement[0].status).toBe('done')
  })
})

describe('one deposit across several invoices', () => {
  const inv = (id: string, clientId: string, balance: number, due: string, clientName = 'Kabir Foods Pvt Ltd') => ({ id, number: `INV/${id}`, clientId, clientName, entityId: ENTITY, balancePaise: balance, subtotalPaise: balance, issueDate: '2026-08-01', dueDate: due, utrs: [] })

  it('suggests the invoices of one client whose balances add up to the deposit', async () => {
    const { suggestSplits } = await import('./match')
    const open = [inv('a', 'c1', 5_000_000, '2026-09-01'), inv('b', 'c1', 3_000_000, '2026-09-10'), inv('c', 'c1', 2_000_000, '2026-09-20'), inv('d', 'c2', 3_000_000, '2026-09-05', 'Zenith Motors')]
    const splits = suggestSplits({ date: '2026-10-01', amountPaise: 8_000_000, narration: 'NEFT CR KABIR FOODS', reference: '' }, open)
    expect(splits[0]).toMatchObject({ clientId: 'c1', totalPaise: 8_000_000, named: true, invoices: [{ invoiceId: 'a' }, { invoiceId: 'b' }] })
    expect(splits.every((s) => s.invoices.every((i) => i.invoiceId !== 'd'))).toBe(true)
    expect(suggestSplits({ date: '2026-10-01', amountPaise: 1_234_500, narration: '', reference: '' }, open)).toEqual([])
  })

  it('never allocates more than the deposit when the balances are up to a rupee over it', async () => {
    const { suggestSplits } = await import('./match')
    const { splitTotals } = await import('./split')
    const open = [inv('a', 'c1', 500_050, '2026-09-01'), inv('b', 'c1', 300_000, '2026-09-10')]
    const [split] = suggestSplits({ date: '2026-10-01', amountPaise: 800_000, narration: '', reference: '' }, open)
    expect(split.invoices).toEqual([{ invoiceId: 'a', number: 'INV/a', amountPaise: 500_050 }, { invoiceId: 'b', number: 'INV/b', amountPaise: 299_950 }])
    expect(split.totalPaise).toBe(800_000)
    const lines = split.invoices.map((i) => ({ invoiceId: i.invoiceId, amountPaise: i.amountPaise, tdsPaise: 0 }))
    expect(splitTotals(800_000, lines, new Map([['a', 500_050], ['b', 300_000]])).problem).toBeNull()
    // Under the deposit, the balances are paid in full and the rest stays as advance.
    const [under] = suggestSplits({ date: '2026-10-01', amountPaise: 800_100, narration: '', reference: '' }, open)
    expect(under.invoices.map((i) => i.amountPaise)).toEqual([500_050, 300_000])
  })

  it('never mixes clients and prefers fewer invoices', async () => {
    const { suggestSplits } = await import('./match')
    const open = [inv('a', 'c1', 1_000_000, '2026-09-01'), inv('b', 'c2', 1_000_000, '2026-09-01', 'Zenith'), inv('c', 'c1', 600_000, '2026-09-02'), inv('d', 'c1', 400_000, '2026-09-03')]
    const splits = suggestSplits({ date: '2026-10-01', amountPaise: 2_000_000, narration: '', reference: '' }, open, 5)
    expect(splits.map((s) => s.invoices.map((i) => i.invoiceId))).toEqual([['a', 'c', 'd']])
  })

  it('drafts a manual split oldest first and checks it before saving', async () => {
    const { draftSplit, rupeesToPaise, splitTotals } = await import('./split')
    const invoices = [{ id: 'b', dueDate: '2026-09-10', balancePaise: 3_000_000 }, { id: 'a', dueDate: '2026-09-01', balancePaise: 5_000_000 }]
    const draft = draftSplit(6_000_000, invoices)
    expect(draft).toEqual([{ invoiceId: 'a', amountPaise: 5_000_000, tdsPaise: 0 }, { invoiceId: 'b', amountPaise: 1_000_000, tdsPaise: 0 }])
    const balances = new Map([['a', 5_000_000], ['b', 3_000_000]])
    expect(splitTotals(6_000_000, draft, balances)).toMatchObject({ allocatedPaise: 6_000_000, advancePaise: 0, problem: null })
    expect(splitTotals(6_000_000, [{ invoiceId: 'a', amountPaise: 5_000_000, tdsPaise: 0 }, { invoiceId: 'b', amountPaise: 2_000_000, tdsPaise: 0 }], balances).problem).toMatch(/more than the deposit/)
    expect(splitTotals(9_000_000, [{ invoiceId: 'a', amountPaise: 4_900_000, tdsPaise: 200_000 }], balances).problem).toMatch(/balance/)
    expect(splitTotals(6_000_000, [{ invoiceId: 'a', amountPaise: 1_000_000, tdsPaise: 0 }], balances)).toMatchObject({ advancePaise: 5_000_000, problem: null })
    expect(rupeesToPaise('1,234.5')).toBe(123_450)
    expect(rupeesToPaise('12abc')).toBeNaN()
  })

  it('records one receipt with an allocation per invoice, and refuses mixed clients or more than the deposit', async () => {
    for (const k of Object.keys(tables)) delete tables[k]
    tables.BankTxn = [{ _id: 't1', entityId: ENTITY, bankAccountId: null, date: '2026-10-01', narration: 'NEFT CR KABIR', reference: '', direction: 'credit', amountPaise: 8_000_000, status: 'unmatched', statementId: 's1' }]
    tables.BankStatement = [{ _id: 's1', status: 'done', undoUntil: new Date(Date.now() + 86_400_000) }]
    tables.Invoice = [{ _id: 'i1', clientId: 'c1', entityId: ENTITY, number: 'INV/1' }, { _id: 'i2', clientId: 'c1', entityId: ENTITY, number: 'INV/2' }, { _id: 'i3', clientId: 'c2', entityId: ENTITY, number: 'INV/3' }]
    recordReceipt.mockReset().mockResolvedValue({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', number: 'RCT/009', allocatedPaise: 8_000_000, unallocatedPaise: 0 })
    const { confirmSplit } = await import('./service')
    await expect(confirmSplit(ctx, { txnId: 't1', allocations: [{ invoiceId: 'i1', amountPaise: 1, tdsPaise: 0 }, { invoiceId: 'i3', amountPaise: 1, tdsPaise: 0 }], score: null })).rejects.toThrow(/one client/)
    await expect(confirmSplit(ctx, { txnId: 't1', allocations: [{ invoiceId: 'i1', amountPaise: 5_000_000, tdsPaise: 0 }, { invoiceId: 'i2', amountPaise: 3_500_000, tdsPaise: 0 }], score: null })).rejects.toThrow(/more than the deposit/)
    expect(tables.BankTxn[0].status).toBe('unmatched')
    const out = await confirmSplit(ctx, { txnId: 't1', allocations: [{ invoiceId: 'i1', amountPaise: 5_000_000, tdsPaise: 0 }, { invoiceId: 'i2', amountPaise: 3_000_000, tdsPaise: 0 }], score: null })
    expect(recordReceipt).toHaveBeenCalledTimes(1)
    expect(recordReceipt.mock.calls[0][1]).toMatchObject({ clientId: 'c1', amountPaise: 8_000_000, allocations: [{ invoiceId: 'i1', amountPaise: 5_000_000 }, { invoiceId: 'i2', amountPaise: 3_000_000 }] })
    expect(out.invoiceNumbers).toEqual(['INV/1', 'INV/2'])
    expect(tables.BankTxn[0]).toMatchObject({ status: 'matched', invoiceId: 'i1', invoiceIds: ['i1', 'i2'] })
  })
})
