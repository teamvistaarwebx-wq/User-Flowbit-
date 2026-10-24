import { isValidGstin } from '@/modules/folio/engine/gst'
import { MAX_DOCUMENT_NUMBER_LENGTH } from '@/modules/folio/engine/numbering'

/**
 * E-invoice (IRN) and e-way bill payloads from a Folio invoice (pure).
 * Field names follow the NIC e-invoice JSON schema v1.1 (einv-apisandbox.nic.in,
 * "Generate IRN"): Version, TranDtls, DocDtls, SellerDtls, BuyerDtls, ItemList,
 * ValDtls; amounts are rupees with two decimals, Pin a number, Stcd and SlNo
 * strings. Cancel and e-way bill by IRN follow the same portal's APIs.
 */

const RUPEES = (paise: number) => Math.round(paise) / 100

/** The e-invoice threshold the turnover flag stands for: aggregate turnover above ₹5 crore (CBDT/GSTN, from 1 Aug 2023). */
export const EINVOICE_TURNOVER_THRESHOLD_RUPEES = 5_00_00_000
/** An IRN can be cancelled on the IRP only within 24 hours of its acknowledgement. */
export const CANCEL_WINDOW_HOURS = 24

export type InvoiceForEinvoice = {
  number?: string | null
  issueDate: string
  status: string
  documentType: string
  supplyType: string
  reverseCharge?: boolean | null
  placeOfSupplyStateCode?: string | null
  clientGstin?: string | null
  entityGstin?: string | null
  billTo?: { name?: string | null; addressLines?: string[] | null; city?: string | null; stateCode?: string | null; pincode?: string | null; gstin?: string | null } | null
  from?: { legalName?: string | null; tradeName?: string | null; gstin?: string | null; addressLines?: string[] | null; city?: string | null; stateCode?: string | null; pincode?: string | null; email?: string | null; phone?: string | null } | null
  lines: { description: string; hsnSac?: string | null; quantity: number; unit?: string | null; ratePaise: number; taxablePaise: number; gstRatePercent: number; cgstPaise: number; sgstPaise: number; igstPaise: number; lineTotalPaise: number }[]
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  roundOffPaise: number
  totalPaise: number
}

export type EinvoiceSwitches = { enabled: boolean; turnoverAboveThreshold: boolean } | null | undefined

/** Why this invoice needs no IRN (null: it is eligible). B2B tax invoices with a buyer GSTIN, when the entity has e-invoicing on. */
export function ineligibleReason(inv: InvoiceForEinvoice, settings: EinvoiceSwitches): string | null {
  if (!settings?.enabled) return 'E-invoicing is off for this firm (Folio settings → E-invoice).'
  if (!settings.turnoverAboveThreshold) return 'E-invoicing applies only when aggregate turnover is above ₹5 crore. Tick the turnover box in Folio settings → E-invoice if it is.'
  if (inv.documentType !== 'tax_invoice') return 'Only tax invoices get an IRN.'
  if (inv.status === 'draft') return 'Issue the invoice first.'
  if (inv.status === 'void') return 'This invoice is void.'
  if (!inv.clientGstin) return 'The client has no GSTIN, so this is a B2C invoice and needs no IRN.'
  if (inv.supplyType === 'export') return 'Export invoices are not supported yet; register them on the IRP directly.'
  if (inv.reverseCharge) return 'Reverse-charge invoices are not supported yet; register them on the IRP directly.'
  return null
}

const UQC = new Set(['BAG', 'BOX', 'BTL', 'CTN', 'DOZ', 'GMS', 'KGS', 'KLR', 'KME', 'LTR', 'MTR', 'MTS', 'NOS', 'PAC', 'PCS', 'SET', 'SQF', 'SQM', 'TON', 'UNT', 'OTH'])
const UNIT_ALIASES: Record<string, string> = { nos: 'NOS', no: 'NOS', number: 'NOS', pcs: 'PCS', piece: 'PCS', pieces: 'PCS', kg: 'KGS', kgs: 'KGS', box: 'BOX', set: 'SET', unit: 'UNT', units: 'UNT', month: 'OTH', months: 'OTH', hr: 'OTH', hrs: 'OTH', hour: 'OTH', hours: 'OTH' }

/** The NIC unit quantity code for Folio's free-text unit ('nos' → NOS; anything else → OTH). */
export function uqcOf(unit: string | null | undefined): string {
  const u = (unit ?? '').trim()
  if (!u) return 'NOS'
  const upper = u.toUpperCase()
  return UNIT_ALIASES[u.toLowerCase()] ?? (UQC.has(upper) ? upper : 'OTH')
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export const nicDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const clip = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max)
const pin = (value: string | null | undefined) => Number((value ?? '').replace(/\D/g, '')) || 0

export type IrnPayload = ReturnType<typeof buildIrnPayload>

export function buildIrnPayload(inv: InvoiceForEinvoice) {
  const from = inv.from ?? {}
  const bill = inv.billTo ?? {}
  const sez = inv.supplyType === 'sez'
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: sez ? (inv.igstPaise > 0 ? 'SEZWP' : 'SEZWOP') : 'B2B', RegRev: inv.reverseCharge ? 'Y' : 'N', EcmGstin: null, IgstOnIntra: 'N' },
    // Never clipped: two numbers that share their first 16 characters would collide (R3 H2). irnPayloadProblems refuses a long one.
    DocDtls: { Typ: 'INV', No: (inv.number ?? '').trim(), Dt: nicDate(inv.issueDate) },
    SellerDtls: {
      Gstin: clip(inv.entityGstin ?? from.gstin, 15).toUpperCase(),
      LglNm: clip(from.legalName, 100),
      ...(from.tradeName ? { TrdNm: clip(from.tradeName, 100) } : {}),
      Addr1: clip(from.addressLines?.[0], 100),
      ...(from.addressLines?.[1] ? { Addr2: clip(from.addressLines[1], 100) } : {}),
      Loc: clip(from.city, 50),
      Pin: pin(from.pincode),
      Stcd: clip(from.stateCode, 2),
      ...(from.phone ? { Ph: clip(from.phone.replace(/\D/g, ''), 12) } : {}),
      ...(from.email ? { Em: clip(from.email, 100) } : {}),
    },
    BuyerDtls: {
      Gstin: clip(inv.clientGstin ?? bill.gstin, 15).toUpperCase(),
      LglNm: clip(bill.name, 100),
      Pos: clip(sez ? '96' : inv.placeOfSupplyStateCode ?? bill.stateCode, 2),
      Addr1: clip(bill.addressLines?.[0], 100),
      ...(bill.addressLines?.[1] ? { Addr2: clip(bill.addressLines[1], 100) } : {}),
      Loc: clip(bill.city, 50),
      Pin: pin(bill.pincode),
      Stcd: clip(bill.stateCode, 2),
    },
    ItemList: inv.lines.map((l, i) => {
      const totAmt = Math.round(l.quantity * l.ratePaise)
      const tax = l.cgstPaise + l.sgstPaise + l.igstPaise
      const hsn = (l.hsnSac ?? '').replace(/\s/g, '')
      return {
        SlNo: String(i + 1),
        PrdDesc: clip(l.description, 300),
        IsServc: hsn.startsWith('99') ? 'Y' : 'N',
        HsnCd: hsn,
        Qty: Math.round(l.quantity * 1000) / 1000,
        Unit: uqcOf(l.unit),
        UnitPrice: RUPEES(l.ratePaise),
        TotAmt: RUPEES(totAmt),
        Discount: RUPEES(Math.max(0, totAmt - l.taxablePaise)),
        AssAmt: RUPEES(l.taxablePaise),
        GstRt: l.gstRatePercent,
        IgstAmt: RUPEES(l.igstPaise),
        CgstAmt: RUPEES(l.cgstPaise),
        SgstAmt: RUPEES(l.sgstPaise),
        TotItemVal: RUPEES(l.taxablePaise + tax),
      }
    }),
    ValDtls: {
      AssVal: RUPEES(inv.taxablePaise),
      CgstVal: RUPEES(inv.cgstPaise),
      SgstVal: RUPEES(inv.sgstPaise),
      IgstVal: RUPEES(inv.igstPaise),
      RndOffAmt: RUPEES(inv.roundOffPaise),
      TotInvVal: RUPEES(inv.totalPaise),
    },
  }
}

const DOC_NO = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/
const GST_RATES = new Set([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40])
const near = (a: number, b: number) => Math.abs(a - b) <= 1.01

/** The problems the IRP would reject the payload for, in plain words (empty: ready to submit). */
export function irnPayloadProblems(p: IrnPayload): string[] {
  const problems: string[] = []
  if (p.DocDtls.No.length > MAX_DOCUMENT_NUMBER_LENGTH) problems.push(`The invoice number ${p.DocDtls.No} is ${p.DocDtls.No.length} characters; the IRP allows at most ${MAX_DOCUMENT_NUMBER_LENGTH}. It cannot be registered as it is. Shorten the series in Folio settings for future invoices.`)
  else if (!DOC_NO.test(p.DocDtls.No)) problems.push('The invoice number must be 1–16 letters, digits, / or -, and must not start with 0, / or -.')
  if (!isValidGstin(p.SellerDtls.Gstin)) problems.push("The firm's GSTIN is missing or invalid.")
  if (!isValidGstin(p.BuyerDtls.Gstin)) problems.push("The client's GSTIN is missing or invalid.")
  if (p.SellerDtls.Gstin && p.SellerDtls.Gstin === p.BuyerDtls.Gstin) problems.push('The seller and buyer GSTIN are the same.')
  for (const [who, d] of [['firm', p.SellerDtls], ['client', p.BuyerDtls]] as const) {
    if (!d.LglNm) problems.push(`The ${who}'s legal name is missing.`)
    if (!d.Addr1) problems.push(`The ${who}'s address is missing.`)
    if (d.Loc.length < 3) problems.push(`The ${who}'s city must be at least 3 letters.`)
    if (d.Pin < 100000 || d.Pin > 999999) problems.push(`The ${who}'s PIN code must be 6 digits.`)
    if (!/^\d{1,2}$/.test(d.Stcd) || Number(d.Stcd) === 0) problems.push(`The ${who}'s state code is missing.`)
  }
  if (!/^\d{1,2}$/.test(p.BuyerDtls.Pos)) problems.push('The place of supply is missing.')
  if (!p.ItemList.length) problems.push('The invoice has no lines.')
  if (p.ItemList.length > 1000) problems.push('An e-invoice can carry at most 1,000 lines.')
  p.ItemList.forEach((item) => {
    if (!/^\d{4,8}$/.test(item.HsnCd)) problems.push(`Line ${item.SlNo}: add a 4 to 8 digit HSN or SAC code (6 digits above ₹5 crore turnover).`)
    if (!GST_RATES.has(item.GstRt)) problems.push(`Line ${item.SlNo}: ${item.GstRt}% is not a GST rate the IRP accepts.`)
    if (!near(item.AssAmt, item.TotAmt - item.Discount)) problems.push(`Line ${item.SlNo}: the taxable value does not equal the amount less the discount.`)
  })
  const items = p.ItemList.reduce((s, i) => s + i.AssAmt, 0)
  if (!near(items, p.ValDtls.AssVal)) problems.push('The line taxable values do not add up to the invoice taxable value.')
  const total = p.ValDtls.AssVal + p.ValDtls.CgstVal + p.ValDtls.SgstVal + p.ValDtls.IgstVal + p.ValDtls.RndOffAmt
  if (!near(total, p.ValDtls.TotInvVal)) problems.push('The invoice total does not equal the taxable value plus tax and round off.')
  return problems
}

/** NIC cancel reasons: 1 duplicate, 2 data entry mistake, 3 order cancelled, 4 others. */
export const CANCEL_REASONS = { duplicate: '1', data_entry_mistake: '2', order_cancelled: '3', other: '4' } as const
export type CancelReason = keyof typeof CANCEL_REASONS
export const CANCEL_REASON_LABEL: Record<CancelReason, string> = { duplicate: 'Duplicate', data_entry_mistake: 'Data entry mistake', order_cancelled: 'Order cancelled', other: 'Other' }

export const buildCancelPayload = (irn: string, reason: CancelReason, remark: string) => ({ Irn: irn, CnlRsn: CANCEL_REASONS[reason], CnlRem: clip(remark, 100) || CANCEL_REASON_LABEL[reason] })

/** Whether an IRN acknowledged at `ackDate` ('YYYY-MM-DD HH:mm:ss', IST) can still be cancelled at `now`. */
export function cancelWindowOpen(ackDate: string, now: Date): boolean {
  const iso = ackDate.trim().replace(' ', 'T')
  const acked = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}+05:30`)
  if (Number.isNaN(acked.getTime())) return false
  return now.getTime() - acked.getTime() <= CANCEL_WINDOW_HOURS * 3600_000
}

export const TRANS_MODES = { road: '1', rail: '2', air: '3', ship: '4' } as const
export type TransMode = keyof typeof TRANS_MODES

export type TransportInput = {
  mode: TransMode
  /** Kilometres; 0 lets the portal compute PIN-to-PIN distance. */
  distanceKm: number
  vehicleNo?: string
  transporterId?: string
  transporterName?: string
  transDocNo?: string
  /** 'YYYY-MM-DD' */
  transDocDate?: string
}

export function buildEwbPayload(irn: string, t: TransportInput) {
  const vehicle = (t.vehicleNo ?? '').replace(/[\s-]/g, '').toUpperCase()
  return {
    Irn: irn,
    Distance: Math.max(0, Math.round(t.distanceKm)),
    TransMode: TRANS_MODES[t.mode],
    ...(t.transporterId ? { TransId: t.transporterId.trim().toUpperCase() } : {}),
    ...(t.transporterName ? { TransName: clip(t.transporterName, 100) } : {}),
    ...(t.transDocNo ? { TransDocNo: clip(t.transDocNo, 15) } : {}),
    ...(t.transDocDate ? { TransDocDt: nicDate(t.transDocDate) } : {}),
    ...(vehicle ? { VehNo: vehicle, VehType: 'R' } : {}),
  }
}

/** The problems with transport details before an e-way bill is requested. */
export function transportProblems(t: TransportInput): string[] {
  const problems: string[] = []
  if (t.distanceKm < 0 || t.distanceKm > 4000) problems.push('Distance must be between 0 and 4,000 km (0 lets the portal work it out).')
  const vehicle = (t.vehicleNo ?? '').replace(/[\s-]/g, '')
  if (t.mode === 'road' && !vehicle && !t.transporterId) problems.push('By road, give the vehicle number or the transporter ID.')
  if (vehicle && !/^[A-Z]{2}[0-9A-Z]{4,9}$/i.test(vehicle)) problems.push('The vehicle number looks wrong; use the form MP09AB1234.')
  if (t.transporterId && !isValidGstin(t.transporterId) && !/^88\d{13}$/.test(t.transporterId.trim())) problems.push('The transporter ID must be a GSTIN or a TRANSIN.')
  if (t.mode !== 'road' && (!t.transDocNo || !t.transDocDate)) problems.push('By rail, air or ship, give the transport document number and date.')
  return problems
}
