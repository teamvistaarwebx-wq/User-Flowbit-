import { describe, expect, it } from 'vitest'
import { DEFAULT_TALLY_LEDGERS, resolveTallyLedgers, taxLedgerName } from './ledgers'
import { creditNoteVoucher, expenseVoucher, receiptVoucher, salesVoucher, voucherBalance, writeOffVoucher, type Voucher } from './vouchers'
import { tallyAmount, tallyDate, toTallyXml, xmlEscape } from './xml'

const L = DEFAULT_TALLY_LEDGERS

const intraSale = { number: 'VW/001/26-27', date: '2026-10-05', party: 'Aarav Retail Pvt Ltd', totalPaise: 1_18_000_00, taxablePaise: 1_00_000_00, lines: [{ rate: 18, cgstPaise: 9_000_00, sgstPaise: 9_000_00, igstPaise: 0 }] }
// Two rates, inter-state, and a total rounded up by 40 paise.
const mixedSale = { number: 'VW/002/26-27', date: '2026-10-06', party: 'Zenith & Sons <Motors>', totalPaise: 12_101_00, taxablePaise: 10_499_80, lines: [{ rate: 18, cgstPaise: 0, sgstPaise: 0, igstPaise: 1_349_96 }, { rate: 5, cgstPaise: 0, sgstPaise: 0, igstPaise: 250_84 }] }

const all = (): Voucher[] => [
  salesVoucher(intraSale, L),
  salesVoucher(mixedSale, L),
  creditNoteVoucher({ ...intraSale, number: 'VW-CN/001', totalPaise: 11_800_00, taxablePaise: 10_000_00, lines: [{ rate: 18, cgstPaise: 900_00, sgstPaise: 900_00, igstPaise: 0 }] }, L),
  receiptVoucher({ number: 'VW-RC/0001', date: '2026-10-07', party: intraSale.party, amountPaise: 1_08_000_00, tdsPaise: 10_000_00, cash: false }, L),
  expenseVoucher({ number: 'R-77', date: '2026-10-01', category: 'Rent', vendor: 'Landlord', amountPaise: 59_000_00, gstPaise: 9_000_01, itc: true, interState: false, cash: false }, L),
  expenseVoucher({ number: '', date: '2026-10-02', category: 'Travel', vendor: 'Ola', amountPaise: 1_234_50, gstPaise: 0, itc: false, interState: false, cash: true }, L, 'Journal'),
]

describe('Tally vouchers', () => {
  it('balances every voucher: debits equal credits', () => {
    for (const v of all()) expect(voucherBalance(v)).toBe(0)
  })
  it('posts a sale to the party, sales and output tax by rate', () => {
    const v = salesVoucher(intraSale, L)
    expect(v.entries.map(({ ledger, paise }) => ({ ledger, paise }))).toEqual([
      { ledger: 'Aarav Retail Pvt Ltd', paise: 1_18_000_00 },
      { ledger: 'Sales', paise: -1_00_000_00 },
      { ledger: 'Output CGST 9%', paise: -9_000_00 },
      { ledger: 'Output SGST 9%', paise: -9_000_00 },
    ])
  })
  it('posts no output tax and no round-off for a reverse-charge sale or credit note (R1 6.1)', () => {
    const rcm = { ...intraSale, totalPaise: 1_00_000_00, reverseCharge: true }
    const sale = salesVoucher(rcm, L)
    expect(sale.entries.map(({ ledger, paise }) => ({ ledger, paise }))).toEqual([{ ledger: 'Aarav Retail Pvt Ltd', paise: 1_00_000_00 }, { ledger: 'Sales', paise: -1_00_000_00 }])
    expect(sale.narration).toMatch(/reverse charge: GST 18000\.00 payable by the recipient/)
    const note = creditNoteVoucher({ ...rcm, number: 'CN-1' }, L)
    expect(note.entries).toEqual([{ ledger: 'Sales', paise: 1_00_000_00 }, { ledger: 'Aarav Retail Pvt Ltd', paise: -1_00_000_00 }])
    expect(voucherBalance(note)).toBe(0)
  })
  it('closes rounding on the round-off ledger', () => {
    const v = salesVoucher(mixedSale, L)
    expect(v.entries.find((e) => e.ledger === 'Round Off')?.paise).toBe(-40)
    expect(v.entries.map((e) => e.ledger)).toContain('Output IGST 5%')
  })
  it('credits the party with cash plus TDS on a receipt', () => {
    const v = receiptVoucher({ number: 'R1', date: '2026-10-07', party: 'P', amountPaise: 900, tdsPaise: 100, cash: true }, L)
    expect(v.entries).toEqual([{ ledger: 'Cash', paise: 900 }, { ledger: 'TDS Receivable', paise: 100 }, { ledger: 'P', paise: -1000 }])
  })
  it('splits claimable GST on an intra-state expense and keeps the odd paisa', () => {
    const v = all()[4]
    expect(v.entries.find((e) => e.ledger === 'Input CGST')?.paise).toBe(4_500_00)
    expect(v.entries.find((e) => e.ledger === 'Input SGST')?.paise).toBe(4_500_01)
  })
})

describe('Tally write-offs and bill references (R1 6.6)', () => {
  it('opens a bill on the invoice and settles it on the receipt, leaving the rest on account', () => {
    expect(salesVoucher(intraSale, L).entries[0].bills).toEqual([{ name: 'VW/001/26-27', type: 'New Ref', paise: 1_18_000_00 }])
    const r = receiptVoucher({ number: 'RC-1', date: '2026-10-07', party: intraSale.party, amountPaise: 1_00_000_00, tdsPaise: 10_000_00, cash: false, settles: [{ invoice: 'VW/001/26-27', paise: 1_08_000_00 }] }, L)
    expect(r.entries.find((e) => e.ledger === intraSale.party)?.bills).toEqual([{ name: 'VW/001/26-27', type: 'Agst Ref', paise: -1_08_000_00 }, { name: 'RC-1', type: 'On Account', paise: -2_000_00 }])
  })
  it('exports a write-off as a balanced journal against the invoice', () => {
    const v = writeOffVoucher({ invoice: 'VW/001/26-27', date: '2026-10-09', party: 'Aarav Retail Pvt Ltd', amountPaise: 500_00, reason: 'Short paid' }, L)
    expect(v.type).toBe('Journal')
    expect(voucherBalance(v)).toBe(0)
    expect(v.entries).toEqual([{ ledger: 'Bad Debts Written Off', paise: 500_00 }, { ledger: 'Aarav Retail Pvt Ltd', paise: -500_00, bills: [{ name: 'VW/001/26-27', type: 'Agst Ref', paise: -500_00 }] }])
    expect(toTallyXml({ company: null, vouchers: [v], debtorsGroup: 'Sundry Debtors' })).toContain('<BILLALLOCATIONS.LIST><NAME>VW/001/26-27</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>500.00</AMOUNT></BILLALLOCATIONS.LIST>')
  })
})

describe('Tally XML', () => {
  const xml = toTallyXml({ company: 'Vistaar & Co', vouchers: all(), parties: [{ name: 'Zenith & Sons <Motors>', gstin: '27AAAPZ1234C1Z5', state: 'Maharashtra' }], debtorsGroup: L.debtorsGroup })

  it('follows the import envelope in order', () => {
    const order = ['<ENVELOPE>', '<HEADER>', '<TALLYREQUEST>Import Data</TALLYREQUEST>', '<BODY>', '<IMPORTDATA>', '<REQUESTDESC>', '<SVCURRENTCOMPANY>Vistaar &amp; Co</SVCURRENTCOMPANY>', '<REQUESTDATA>', '<TALLYMESSAGE', '<LEDGER NAME=', '<VOUCHER VCHTYPE="Sales"', '</REQUESTDATA>', '</IMPORTDATA>', '</BODY>', '</ENVELOPE>']
    const positions = order.map((t) => xml.indexOf(t))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(xml.match(/<VOUCHER /g)).toHaveLength(6)
    expect(xml.match(/<TALLYMESSAGE/g)).toHaveLength(7)
  })
  it('escapes names and writes dates and amounts the Tally way', () => {
    expect(xml).toContain('<PARTYLEDGERNAME>Zenith &amp; Sons &lt;Motors&gt;</PARTYLEDGERNAME>')
    expect(xml).not.toContain('<Motors>')
    expect(tallyDate('2026-10-05')).toBe('20261005')
    expect(tallyAmount(-1_18_000_00)).toBe('-118000.00')
    expect(tallyAmount(40)).toBe('0.40')
    expect(xmlEscape('a\u0001b')).toBe('ab')
  })
  it('balances each voucher in the XML: AMOUNTs sum to zero, debits are deemed positive', () => {
    const vouchers = xml.match(/<VOUCHER [\s\S]*?<\/VOUCHER>/g) ?? []
    expect(vouchers).toHaveLength(6)
    for (const v of vouchers) {
      const entries = [...v.matchAll(/<ISDEEMEDPOSITIVE>(Yes|No)<\/ISDEEMEDPOSITIVE><AMOUNT>(-?\d+\.\d{2})<\/AMOUNT>/g)]
      expect(entries.length).toBeGreaterThan(1)
      const paise = entries.map((m) => Math.round(Number(m[2]) * 100))
      expect(paise.reduce((s, n) => s + n, 0)).toBe(0)
      for (const m of entries) expect(m[1] === 'Yes').toBe(Number(m[2]) < 0)
    }
  })
})

describe('Tally ledger names', () => {
  it('fills blanks with defaults and expands {rate}', () => {
    const l = resolveTallyLedgers({ sales: '  Professional Fees ', bank: '', outputIgst: 42 })
    expect(l.sales).toBe('Professional Fees')
    expect(l.bank).toBe('Bank Account')
    expect(l.outputIgst).toBe('Output IGST {rate}%')
    expect(taxLedgerName(l.outputCgst, 2.5)).toBe('Output CGST 2.5%')
    expect(taxLedgerName('GST Payable', 18)).toBe('GST Payable')
  })
})
