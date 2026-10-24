import { describe, expect, it, vi } from 'vitest'
import { createGenericGsp, GspError, readEnvelope, type JsonPost } from './gsp'
import { buildCancelPayload, buildEwbPayload, buildIrnPayload, cancelWindowOpen, ineligibleReason, irnPayloadProblems, nicDate, transportProblems, uqcOf, type InvoiceForEinvoice } from './payload'

const invoice: InvoiceForEinvoice = {
  number: 'VWX/26-27/0007',
  issueDate: '2026-10-09',
  status: 'issued',
  documentType: 'tax_invoice',
  supplyType: 'intra_state',
  reverseCharge: false,
  placeOfSupplyStateCode: '23',
  clientGstin: '23AAACB1234C1Z5',
  entityGstin: '23ABCPE1234F1Z5',
  billTo: { name: 'Bright Foods Pvt Ltd', addressLines: ['12 MG Road'], city: 'Indore', stateCode: '23', pincode: '452001' },
  from: { legalName: 'Vistaar Webx Services LLP', addressLines: ['2nd Floor, Sapphire Tower', 'Vijay Nagar'], city: 'Indore', stateCode: '23', pincode: '452010', email: 'billing@vistaar.in', phone: '+91 98260 00000' },
  lines: [
    { description: 'Social media retainer', hsnSac: '998361', quantity: 1, unit: 'month', ratePaise: 50_000_00, taxablePaise: 45_000_00, gstRatePercent: 18, cgstPaise: 4_050_00, sgstPaise: 4_050_00, igstPaise: 0, lineTotalPaise: 53_100_00 },
    { description: 'Ad creatives', hsnSac: '998361', quantity: 4, unit: 'nos', ratePaise: 2_500_00, taxablePaise: 10_000_00, gstRatePercent: 18, cgstPaise: 900_00, sgstPaise: 900_00, igstPaise: 0, lineTotalPaise: 11_800_00 },
  ],
  taxablePaise: 55_000_00,
  cgstPaise: 4_950_00,
  sgstPaise: 4_950_00,
  igstPaise: 0,
  roundOffPaise: 0,
  totalPaise: 64_900_00,
}

const ON = { enabled: true, turnoverAboveThreshold: true }

describe('eligibility', () => {
  it('needs e-invoicing on, the turnover flag, a tax invoice and a buyer GSTIN', () => {
    expect(ineligibleReason(invoice, ON)).toBeNull()
    expect(ineligibleReason(invoice, null)).toMatch(/off/)
    expect(ineligibleReason(invoice, { enabled: true, turnoverAboveThreshold: false })).toMatch(/₹5 crore/)
    expect(ineligibleReason({ ...invoice, clientGstin: null }, ON)).toMatch(/B2C/)
    expect(ineligibleReason({ ...invoice, documentType: 'sale_invoice' }, ON)).toMatch(/tax invoices/)
    expect(ineligibleReason({ ...invoice, status: 'draft' }, ON)).toMatch(/Issue/)
  })
})

describe('IRN payload (NIC schema v1.1)', () => {
  const p = buildIrnPayload(invoice)

  it('maps the header, parties and dates', () => {
    expect(p.Version).toBe('1.1')
    expect(p.TranDtls).toEqual({ TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', EcmGstin: null, IgstOnIntra: 'N' })
    expect(p.DocDtls).toEqual({ Typ: 'INV', No: 'VWX/26-27/0007', Dt: '09/10/2026' })
    expect(p.SellerDtls).toMatchObject({ Gstin: '23ABCPE1234F1Z5', LglNm: 'Vistaar Webx Services LLP', Addr1: '2nd Floor, Sapphire Tower', Addr2: 'Vijay Nagar', Loc: 'Indore', Pin: 452010, Stcd: '23', Ph: '919826000000' })
    expect(p.BuyerDtls).toMatchObject({ Gstin: '23AAACB1234C1Z5', Pos: '23', Pin: 452001, Stcd: '23' })
  })

  it('maps lines in rupees with the discount as gross less taxable', () => {
    expect(p.ItemList[0]).toMatchObject({ SlNo: '1', IsServc: 'Y', HsnCd: '998361', Qty: 1, Unit: 'OTH', UnitPrice: 50000, TotAmt: 50000, Discount: 5000, AssAmt: 45000, GstRt: 18, CgstAmt: 4050, SgstAmt: 4050, IgstAmt: 0, TotItemVal: 53100 })
    expect(p.ItemList[1]).toMatchObject({ Unit: 'NOS', Qty: 4, TotAmt: 10000, Discount: 0 })
    expect(p.ValDtls).toEqual({ AssVal: 55000, CgstVal: 4950, SgstVal: 4950, IgstVal: 0, RndOffAmt: 0, TotInvVal: 64900 })
  })

  it('passes validation when complete', () => {
    expect(irnPayloadProblems(p)).toEqual([])
  })

  it('names what the IRP would reject', () => {
    const bad = buildIrnPayload({ ...invoice, number: '/0007', clientGstin: 'X', billTo: { ...invoice.billTo, pincode: '12' }, lines: [{ ...invoice.lines[0], hsnSac: '' }] })
    const problems = irnPayloadProblems(bad).join(' ')
    expect(problems).toMatch(/invoice number/)
    expect(problems).toMatch(/client's GSTIN/)
    expect(problems).toMatch(/client's PIN/)
    expect(problems).toMatch(/HSN or SAC/)
    expect(problems).toMatch(/do not add up/)
  })

  it('refuses a number over 16 characters instead of clipping it', () => {
    // Arrange
    const long = buildIrnPayload({ ...invoice, number: 'ACME/2026-27/0001' })
    // Act
    const problems = irnPayloadProblems(long)
    // Assert
    expect(long.DocDtls.No).toBe('ACME/2026-27/0001')
    expect(problems.join(' ')).toMatch(/17 characters; the IRP allows at most 16/)
  })

  it('marks SEZ supplies with payment of tax', () => {
    const sez = buildIrnPayload({ ...invoice, supplyType: 'sez', igstPaise: 9_900_00, cgstPaise: 0, sgstPaise: 0 })
    expect(sez.TranDtls.SupTyp).toBe('SEZWP')
    expect(sez.BuyerDtls.Pos).toBe('96')
  })

  it('maps units and dates', () => {
    expect(uqcOf('nos')).toBe('NOS')
    expect(uqcOf('hours')).toBe('OTH')
    expect(uqcOf('KGS')).toBe('KGS')
    expect(nicDate('2027-01-05')).toBe('05/01/2027')
  })
})

describe('cancel and e-way bill', () => {
  it('cancels only within 24 hours of the acknowledgement (IST)', () => {
    expect(cancelWindowOpen('2026-10-09 10:00:00', new Date('2026-10-10T04:00:00Z'))).toBe(true)
    expect(cancelWindowOpen('2026-10-09 10:00:00', new Date('2026-10-10T05:00:00Z'))).toBe(false)
    expect(cancelWindowOpen('not a date', new Date())).toBe(false)
    expect(buildCancelPayload('abc', 'data_entry_mistake', '')).toEqual({ Irn: 'abc', CnlRsn: '2', CnlRem: 'Data entry mistake' })
  })

  it('builds the e-way bill by IRN payload from transport details', () => {
    expect(buildEwbPayload('abc', { mode: 'road', distanceKm: 120.4, vehicleNo: 'mp09 ab-1234', transDocDate: '2026-10-09', transDocNo: 'LR12' })).toEqual({ Irn: 'abc', Distance: 120, TransMode: '1', TransDocNo: 'LR12', TransDocDt: '09/10/2026', VehNo: 'MP09AB1234', VehType: 'R' })
    expect(transportProblems({ mode: 'road', distanceKm: 10 })).toEqual(['By road, give the vehicle number or the transporter ID.'])
    expect(transportProblems({ mode: 'air', distanceKm: 5000 })).toHaveLength(2)
    expect(transportProblems({ mode: 'road', distanceKm: 0, vehicleNo: 'MP09AB1234' })).toEqual([])
  })
})

describe('generic GSP adapter (mocked HTTP)', () => {
  const config = { baseUrl: 'https://gsp.example.com/', clientId: 'cid', clientSecret: 'secret', username: 'api_user', password: 'pw', gstin: '23ABCPE1234F1Z5' }

  function mockPost(replies: Record<string, unknown>): JsonPost & { mock: { calls: unknown[][] } } {
    return vi.fn(async (url: string) => {
      const path = new URL(url).pathname
      return { status: 200, json: replies[path] }
    }) as unknown as JsonPost & { mock: { calls: unknown[][] } }
  }

  it('authenticates once, then registers the IRN with the token header', async () => {
    const post = mockPost({
      '/eivital/v1.04/auth': { Status: 1, Data: { AuthToken: 'tok' } },
      '/eicore/v1.03/Invoice': { Status: 1, Data: JSON.stringify({ AckNo: 112010036563310, AckDt: '2026-10-09 12:01:00', Irn: 'a5c12d', SignedInvoice: 'eyJ', SignedQRCode: 'eyQR', EwbNo: null }) },
    })
    const gsp = createGenericGsp(config, post)
    const result = await gsp.generateIrn(buildIrnPayload(invoice))
    expect(result).toEqual({ irn: 'a5c12d', ackNo: '112010036563310', ackDate: '2026-10-09 12:01:00', signedQr: 'eyQR', signedInvoice: 'eyJ', ewbNo: null, ewbDate: null, ewbValidTill: null })
    await gsp.generateIrn(buildIrnPayload(invoice))
    const urls = post.mock.calls.map((c) => c[0])
    expect(urls.filter((u) => String(u).endsWith('/auth'))).toHaveLength(1)
    expect(post.mock.calls[1][2]).toMatchObject({ client_id: 'cid', gstin: '23ABCPE1234F1Z5', AuthToken: 'tok' })
  })

  it('turns IRP errors into a readable GspError with the code', async () => {
    const post = mockPost({
      '/eivital/v1.04/auth': { Status: 1, Data: { AuthToken: 'tok' } },
      '/eicore/v1.03/Invoice': { Status: 0, ErrorDetails: [{ ErrorCode: '2150', ErrorMessage: 'Duplicate IRN' }] },
    })
    await expect(createGenericGsp(config, post).generateIrn(buildIrnPayload(invoice))).rejects.toMatchObject({ name: 'GspError', code: '2150' })
  })

  it('cancels and generates e-way bills', async () => {
    const post = mockPost({
      '/eivital/v1.04/auth': { Status: 1, Data: { AuthToken: 'tok' } },
      '/eicore/v1.03/Invoice/Cancel': { Status: 1, Data: { Irn: 'a5c12d', CancelDate: '2026-10-09 15:00:00' } },
      '/eiewb/v1.03/ewaybill': { Status: 1, Data: { EwbNo: 141008732, EwbDt: '2026-10-09 15:10:00', EwbValidTill: '2026-10-10 23:59:00' } },
    })
    const gsp = createGenericGsp(config, post)
    expect(await gsp.cancelIrn(buildCancelPayload('a5c12d', 'duplicate', 'dup'))).toEqual({ irn: 'a5c12d', cancelDate: '2026-10-09 15:00:00' })
    expect(await gsp.generateEwb(buildEwbPayload('a5c12d', { mode: 'road', distanceKm: 0, vehicleNo: 'MP09AB1234' }))).toEqual({ ewbNo: '141008732', ewbDate: '2026-10-09 15:10:00', validTill: '2026-10-10 23:59:00' })
  })

  it('refuses HTTP errors and unreadable replies', () => {
    expect(() => readEnvelope(500, {})).toThrow(GspError)
    expect(() => readEnvelope(200, { Status: 1, Data: '{bad' })).toThrow(/could not read/)
  })
})
