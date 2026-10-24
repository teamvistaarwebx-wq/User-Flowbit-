import { createElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { companyProfileOf } from '@/lib/company-profile'

vi.mock('server-only', () => ({}))

/** A 1×1 PNG: stands in for a signature, a seal and a logo. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const SIG_ID = 's'.repeat(24)
const SEAL_ID = 'e'.repeat(24)

const ORG = {
  name: 'Vistaar',
  gstin: '23ABCDE1234F1Z5',
  address: { line1: '2nd Floor, Sapphire Tower', city: 'Indore', state: 'MP', pincode: '452010' },
  profile: { legalName: 'Sanskaar Webx Services LLP', tradeName: 'Vistaar WebX', website: 'vistaar.test', email: 'hello@vistaar.test', phone: '+919800000000', cinLlpin: 'AAB-1234' },
  signatories: [{ _id: 'a'.repeat(24), name: 'Asha Rao', designation: 'Director', signatureFileId: SIG_ID, sealFileId: SEAL_ID, isDefault: true }],
}
const NON_GST = { name: 'Solo', address: { line1: '1 MG Road', city: 'Pune', state: 'MH', pincode: '411001' }, profile: { gstRegistered: false } }

// Storage and the Org lookup are the only I/O; everything else is the real code.
vi.mock('@/lib/pdf/org-branding', async () => {
  const { companyLetterhead, signatureModel } = await import('./letterhead')
  const { FLOWBIT_PDF_BRAND } = await import('./brand')
  const company = (org: typeof ORG | typeof NON_GST) => {
    const profile = companyProfileOf(org)
    return { profile, brand: FLOWBIT_PDF_BRAND, logoSrc: PNG, letterhead: companyLetterhead(profile, { brand: FLOWBIT_PDF_BRAND, logoSrc: PNG }) }
  }
  type Signer = { name: string; designation?: string | null; signatureFileId?: unknown; sealFileId?: unknown } | null
  return {
    companyPdfOf: async (org: typeof ORG) => company(org),
    orgPdfCompany: async () => company(ORG),
    pdfSignature: async (_orgId: unknown, forName: string, signer: Signer) => signatureModel(forName, signer, { imageSrc: signer?.signatureFileId ? PNG : null, sealSrc: signer?.sealFileId ? PNG : null }),
    pdfImageSrc: async () => null,
  }
})
vi.mock('@/lib/files', () => ({ readStoredFile: async () => null }))

const { companyLetterhead } = await import('./letterhead')
const { contactLine, gstLine, PdfDocument, renderPdf, UNSIGNED_FOOTER } = await import('./base')
const { FLOWBIT_PDF_BRAND } = await import('./brand')
const { LetterDocument } = await import('@/modules/muster/letters/pdf')
const { PayslipDocument } = await import('@/modules/muster/payroll/payslip-pdf')
const { Form130Document } = await import('@/modules/muster/tax/form130-pdf')
const { ReceiptPdf } = await import('@/components/folio/pdf/ReceiptPdf')
const { StatementPdf } = await import('@/components/folio/pdf/StatementPdf')
const { invoicePdfModel } = await import('@/components/folio/pdf/InvoicePdf')
const { FolioPdf } = await import('@/components/folio/pdf/parts')
const { form130Signer } = await import('@/modules/muster/tax/form130-signer')

const art = { brand: FLOWBIT_PDF_BRAND, logoSrc: PNG }
const HEAD = companyLetterhead(companyProfileOf(ORG), art)
const SIGNATURE = { forName: 'Sanskaar Webx Services LLP', name: 'Asha Rao', designation: 'Director', imageSrc: PNG, sealSrc: PNG }

type DocProps = { org: Parameters<typeof gstLine>[0] & { name: string; pan?: string | null; logoSrc?: string | null; website?: string | null; email?: string | null; phone?: string | null }; signature?: unknown; footerNote?: string }
const propsOf = (element: ReactElement): DocProps => element.props as DocProps

const PAYSLIP = {
  monthLabel: 'September 2026', payslipNumber: 'VIS/PS/2026-09/E001', employeeName: 'Ravi Kumar', employeeCode: 'E001', workingDays: 26, payableDays: 26, lopDays: 0,
  totalEarnings: 5000000, totalDeductions: 600000, reimbursementAmount: 0, netPay: 4400000,
  lines: [{ code: 'BASIC', label: 'Basic', lineType: 'earning', amount: 5000000 }, { code: 'PF', label: 'PF', lineType: 'deduction', amount: 600000 }],
  snapshot: null,
} as never

const WORKSHEET = { regime: 'new', salaryThisEmployer: 600000, previousEmployerSalary: 0, grossSalary: 600000, hraExemption: 0, standardDeduction: 75000, professionalTax: 0, sec80c: 0, sec80d: 0, nps80ccd1b: 0, homeLoanInterest: 0, totalDeductions: 75000, tax: { taxableIncome: 525000, slabTax: 11250, rebate: 11250, surcharge: 0, cess: 0, totalTax: 0 }, tdsSoFar: 0, previousEmployerTds: 0, remainingTax: 0, monthsLeft: 6, monthlyTdsPaise: 0, otherRegime: { regime: 'old', totalTax: 0 }, notes: [] }
const FORM130 = (signature: unknown) => ({
  fy: '2026-27', employee: { name: 'Ravi Kumar', code: 'E001', pan: 'ABCDE1234F', designation: 'Engineer', from: '2026-04-01', to: '2027-03-31' },
  employer: { tan: 'BPLA12345B', pan: 'ABCDE1234F' }, signatory: { name: 'Asha Rao', designation: 'Director', place: 'Indore' },
  signature, quarters: [{ quarter: 'Q1', amountPaid: 15000000, tds: 0 }], tax: { fy: '2026-27', regime: 'new', verified: true, computedPaise: 0, overridden: false, worksheet: WORKSHEET }, complete: true,
}) as never

const LETTER = { referenceNumber: 'VIS/HR/2026/001', issueDate: '2026-10-09', employeeName: 'Ravi Kumar', subject: 'Offer of employment', body: 'Dear Ravi,\n\nWelcome aboard.', signatoryName: 'Asha Rao', signatoryDesignation: 'Director', templateName: 'Offer letter' }

const RECEIPT = { issuer: HEAD, signature: SIGNATURE, number: 'VWX-RC-0001', receivedOn: '2026-10-01', receivedFrom: 'Acme', amountPaise: 1180000, mode: 'UPI', reference: null, status: 'recorded', allocations: [{ invoiceNumber: 'VWX-0001', amountPaise: 1180000 }] }
const STATEMENT = { from: null, to: '2026-10-09', broughtForwardPaise: 0, rows: [{ date: '2026-10-01', type: 'invoice', document: 'VWX-0001', particulars: 'Retainer', debitPaise: 1180000, creditPaise: 0, balancePaise: 1180000, sourceId: 'x' }], debitPaise: 1180000, creditPaise: 0, closingPaise: 1180000 } as never

const INVOICE = {
  _id: 'i'.repeat(24), status: 'draft', documentType: 'tax_invoice', number: null, issueDate: '2026-10-01', dueDate: '2026-10-16', supplyType: 'intra_state', reverseCharge: false, placeOfSupplyStateCode: '23',
  from: { legalName: 'Sanskaar Webx Services LLP', tradeName: 'Vistaar WebX', gstin: '23ABCDE1234F1Z5', pan: 'ABCDE1234F', addressLines: ['2nd Floor'], city: 'Indore', stateCode: '23', pincode: '452010' },
  billTo: { name: 'Acme', addressLines: ['1 Park St'], city: 'Indore', stateCode: '23', pincode: '452001' },
  lines: [{ description: 'Retainer', hsnSac: '998314', quantity: 1, unit: 'nos', ratePaise: 1000000, discountPercent: 0, gstRatePercent: 18, taxablePaise: 1000000, cgstPaise: 90000, sgstPaise: 90000, igstPaise: 0 }],
  subtotalPaise: 1000000, discountPaise: 0, taxablePaise: 1000000, cgstPaise: 90000, sgstPaise: 90000, igstPaise: 0, roundOffPaise: 0, totalPaise: 1180000, balancePaise: 1180000, tdsPaise: 0, tdsPercent: 0, bank: null,
} as never

describe('every PDF letterhead carries the company profile', () => {
  it('prints logo, legal name, trading name, address, CIN/LLPIN, GSTIN, PAN, email, phone and website', () => {
    expect(HEAD.name).toBe('Sanskaar Webx Services LLP')
    expect(HEAD.logoSrc).toBe(PNG)
    expect(HEAD.addressLines).toEqual(['Trading as Vistaar WebX', '2nd Floor, Sapphire Tower', 'Indore, Madhya Pradesh, 452010', 'CIN/LLPIN: AAB-1234'])
    expect(gstLine(HEAD)).toBe('GSTIN: 23ABCDE1234F1Z5')
    expect(HEAD.pan).toBe('ABCDE1234F')
    expect(contactLine(HEAD)).toBe('hello@vistaar.test  ·  +919800000000  ·  vistaar.test')
  })
  it('says "Not registered under GST" for a non-GST company', () => {
    const head = companyLetterhead(companyProfileOf(NON_GST), art)
    expect(head.gstin).toBeNull()
    expect(gstLine(head)).toBe('Not registered under GST')
  })
})

describe('each PDF builder', () => {
  it('HR letter: the letterhead and the stored signatory with signature and seal', () => {
    const doc = propsOf(LetterDocument({ org: HEAD, letter: LETTER, signature: SIGNATURE }))
    expect(doc.org).toBe(HEAD)
    expect(doc.signature).toEqual(SIGNATURE)
  })
  it('payslip: the letterhead; unsigned by default, signed when the setting is on', () => {
    const unsigned = propsOf(PayslipDocument({ org: HEAD, data: PAYSLIP }))
    expect(unsigned.org).toBe(HEAD)
    expect(unsigned.signature).toBeNull()
    expect(unsigned.footerNote).toMatch(/does not require a signature/)
    const signed = propsOf(PayslipDocument({ org: HEAD, data: PAYSLIP, signature: SIGNATURE }))
    expect(signed.signature).toEqual(SIGNATURE)
    expect(signed.footerNote).not.toMatch(/signature/)
    const bilingual = propsOf(PayslipDocument({ org: HEAD, data: PAYSLIP, language: 'bilingual', signature: SIGNATURE }))
    expect(bilingual.org).toBe(HEAD)
  })
  it('Form 130 Part B: the letterhead and the signer named in the tax-year settings', () => {
    const doc = propsOf(Form130Document({ org: HEAD, data: FORM130(SIGNATURE) }))
    expect(doc.org).toBe(HEAD)
    expect(doc.signature).toEqual(SIGNATURE)
    const profile = companyProfileOf(ORG)
    expect(form130Signer({ name: 'asha rao' }, profile).signatory?.signatureFileId).toBe(SIG_ID)
    expect(form130Signer(null, profile)).toMatchObject({ name: 'Asha Rao', designation: 'Director', place: 'Indore' })
    expect(form130Signer({ name: 'Someone Else', designation: 'CFO' }, profile)).toMatchObject({ name: 'Someone Else', designation: 'CFO', signatory: null })
  })
  it('receipt and statement: the issuer letterhead and a signature block', () => {
    const receipt = propsOf(ReceiptPdf({ model: RECEIPT }))
    expect(receipt.org.name).toBe(HEAD.name)
    expect(receipt.signature).toEqual(SIGNATURE)
    const statement = propsOf(StatementPdf({ workspace: HEAD, issuer: HEAD, signature: SIGNATURE, brandLine: 'Vistaar WebX', client: { name: 'Acme', legalName: 'Acme Pvt Ltd', addressLines: [], gstin: null }, statement: STATEMENT }))
    expect(statement.signature).toEqual(SIGNATURE)
  })
  it('invoice (and its quote, credit note and e-invoice siblings): entity details, profile contacts and the profile signatory when the entity has none', async () => {
    const model = await invoicePdfModel('o'.repeat(24) as never, INVOICE, { showTds: false })
    expect(model.issuer.gstin).toBe('23ABCDE1234F1Z5')
    expect(model.issuer.email).toBe('hello@vistaar.test')
    expect(model.issuer.website).toBe('vistaar.test')
    expect(model.issuer.logoSrc).toBe(PNG)
    expect(model.signatory).toEqual({ forName: 'Sanskaar Webx Services LLP', name: 'Asha Rao', designation: 'Director', imageSrc: PNG, sealSrc: PNG })
    const withOwn = await invoicePdfModel('o'.repeat(24) as never, { ...(INVOICE as object), from: { ...(INVOICE as { from: object }).from, signatoryName: 'Bharat', signatoryTitle: 'Partner' } } as never, { showTds: false })
    expect(withOwn.signatory).toMatchObject({ name: 'Bharat', designation: 'Partner', imageSrc: null, sealSrc: null })
  })
  it('the default footer drops the computer-generated line once a signature block prints', () => {
    const element = (signature: unknown) => PdfDocument({ org: HEAD, title: 'T', signature: signature as never, children: null })
    const footerText = (el: ReactElement) => JSON.stringify(el, (_k, v) => (typeof v === 'function' ? undefined : v))
    expect(footerText(element(null))).toContain(UNSIGNED_FOOTER)
    expect(footerText(element(SIGNATURE))).not.toMatch(/computer-generated/i)
    expect(footerText(element({ ...SIGNATURE, imageSrc: null }))).not.toMatch(/computer-generated/i)
  })
  it('no builder with a signature block says it needs no signature', async () => {
    const noSignatureLine = /no signature|not need a signature|not require a signature|computer.generated/i
    const model = await invoicePdfModel('o'.repeat(24) as never, INVOICE, { showTds: false })
    expect(model.footer).not.toMatch(noSignatureLine)
    expect(model.footer).toBe('Vistaar WebX — a brand of Sanskaar Webx Services LLP · DRAFT')
    expect(propsOf(ReceiptPdf({ model: RECEIPT })).footerNote).toBe('Sanskaar Webx Services LLP · VWX-RC-0001')
    expect(propsOf(ReceiptPdf({ model: { ...RECEIPT, signature: null } })).footerNote).toContain(UNSIGNED_FOOTER)
    expect(propsOf(LetterDocument({ org: HEAD, letter: LETTER, signature: SIGNATURE })).footerNote).not.toMatch(noSignatureLine)
    expect(propsOf(Form130Document({ org: HEAD, data: FORM130(SIGNATURE) })).footerNote).not.toMatch(noSignatureLine)
    expect(propsOf(PayslipDocument({ org: HEAD, data: PAYSLIP, signature: { ...SIGNATURE, imageSrc: null } })).footerNote).not.toMatch(noSignatureLine)
  })
})

describe('the PDFs render', () => {
  const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString() === '%PDF-'
  it('a signed HR letter with a seal', async () => {
    expect(isPdf(await renderPdf(LetterDocument({ org: HEAD, letter: LETTER, signature: SIGNATURE })))).toBe(true)
  }, 30_000)
  it('a signed bilingual payslip and a non-GST unsigned one', async () => {
    expect(isPdf(await renderPdf(PayslipDocument({ org: HEAD, data: PAYSLIP, language: 'bilingual', signature: SIGNATURE })))).toBe(true)
    expect(isPdf(await renderPdf(PayslipDocument({ org: companyLetterhead(companyProfileOf(NON_GST), art), data: PAYSLIP })))).toBe(true)
  }, 30_000)
  it('Form 130 Part B, a receipt and a tax invoice', async () => {
    expect(isPdf(await renderPdf(Form130Document({ org: HEAD, data: FORM130(SIGNATURE) })))).toBe(true)
    expect(isPdf(await renderPdf(ReceiptPdf({ model: RECEIPT })))).toBe(true)
    const model = await invoicePdfModel('o'.repeat(24) as never, INVOICE, { showTds: false })
    expect(isPdf(await renderPdf(createElement(FolioPdf, { model }) as never))).toBe(true)
  }, 30_000)
})
