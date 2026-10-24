import { isTaxable, type SupplyType } from './gst'
import { percentOf, roundToRupee, sumPaise, type Paise } from './money'

/**
 * The pricing engine (verbatim port of BillingOS `lib/invoice/totals.ts`).
 * Prices invoices, quotes, credit notes and seed data. The builder calls it
 * for the live preview and the server calls it again on every save.
 *
 * Order (fixed by the tax rules; changing it changes the tax):
 *   1. line gross = quantity x rate   2. line discount
 *   3. invoice discount apportioned across lines pro rata
 *   4. tax per line at that line's rate   5. round off the total once
 */

export type DiscountType = 'percent' | 'amount'

export type LineInput = {
  description: string
  /** Thousandths are kept, so 1.5 hours is representable. */
  quantity: number
  rate: Paise
  discountPercent?: number
  gstRatePercent: number
}

export type ComputedLine = {
  grossValue: Paise
  discountAmount: Paise
  taxableValue: Paise
  gstRatePercent: number
  cgstAmount: Paise
  sgstAmount: Paise
  igstAmount: Paise
  lineTotal: Paise
}

export type InvoiceInput = {
  lines: readonly LineInput[]
  supplyType: SupplyType
  discountType?: DiscountType | null
  /** Percent number, or paise when `amount`. */
  discountValue?: number
  roundOffTotal?: boolean
  tdsPercent?: number
  /**
   * Reverse charge: the client pays the GST to the government, so the tax is
   * still worked out (shown on the invoice, filed in GSTR-1) but not billed.
   */
  reverseCharge?: boolean
}

export type ComputedInvoice = {
  lines: ComputedLine[]
  subtotal: Paise
  discountAmount: Paise
  taxableValue: Paise
  cgstAmount: Paise
  sgstAmount: Paise
  igstAmount: Paise
  taxAmount: Paise
  roundOff: Paise
  total: Paise
  tdsAmount: Paise
  expectedReceipt: Paise
}

const QUANTITY_SCALE = 1000

function lineGross(line: LineInput): Paise {
  const scaled = Math.round(line.quantity * QUANTITY_SCALE)
  return Math.round((line.rate * scaled) / QUANTITY_SCALE)
}

function invoiceDiscount(base: Paise, discountType: DiscountType | null | undefined, discountValue: number): Paise {
  if (!discountType || discountValue <= 0) return 0
  if (discountType === 'percent') return percentOf(base, Math.min(discountValue, 100))
  return Math.min(Math.round(discountValue), base)
}

/** Pro-rata split; the rounding remainder goes to the largest line (first on ties). */
function apportion(total: Paise, weights: readonly Paise[]): Paise[] {
  const weightSum = sumPaise(weights)
  if (total === 0 || weightSum === 0) return weights.map(() => 0)
  const shares = weights.map((weight) => Math.floor((total * weight) / weightSum))
  const remainder = total - sumPaise(shares)
  if (remainder !== 0) {
    let largest = 0
    for (let i = 1; i < weights.length; i += 1) if (weights[i] > weights[largest]) largest = i
    shares[largest] += remainder
  }
  return shares
}

function priceLine(line: LineInput, afterLine: Paise, share: Paise, gross: Paise, lineDiscount: Paise, supplyType: SupplyType): ComputedLine {
  const taxableValue = afterLine - share
  const rate = isTaxable(supplyType) ? line.gstRatePercent : 0
  const tax = percentOf(taxableValue, rate)
  const intra = supplyType === 'intra_state'
  const half = Math.round(tax / 2)
  let cgst = intra ? half : 0
  let sgst = intra ? tax - half : 0
  const igst = isTaxable(supplyType) && !intra ? tax : 0
  let lineTotal = taxableValue + cgst + sgst + igst
  // Level an odd tax so CGST equals SGST: costs at most one paisa per line.
  if (cgst !== sgst) {
    const levelled = Math.min(cgst, sgst)
    lineTotal -= cgst + sgst - levelled * 2
    cgst = levelled
    sgst = levelled
  }
  return { grossValue: gross, discountAmount: lineDiscount + share, taxableValue, gstRatePercent: rate, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, lineTotal }
}

export function computeInvoice(input: InvoiceInput): ComputedInvoice {
  const grossValues = input.lines.map(lineGross)
  const lineDiscounts = input.lines.map((line, i) => (line.discountPercent && line.discountPercent > 0 ? percentOf(grossValues[i], Math.min(line.discountPercent, 100)) : 0))
  const afterLineDiscount = grossValues.map((gross, i) => gross - lineDiscounts[i])
  const headDiscount = invoiceDiscount(sumPaise(afterLineDiscount), input.discountType, input.discountValue ?? 0)
  const headShares = apportion(headDiscount, afterLineDiscount)
  const lines = input.lines.map((line, i) => priceLine(line, afterLineDiscount[i], headShares[i], grossValues[i], lineDiscounts[i], input.supplyType))

  const taxableValue = sumPaise(lines.map((l) => l.taxableValue))
  const cgstAmount = sumPaise(lines.map((l) => l.cgstAmount))
  const sgstAmount = sumPaise(lines.map((l) => l.sgstAmount))
  const igstAmount = sumPaise(lines.map((l) => l.igstAmount))
  const taxAmount = cgstAmount + sgstAmount + igstAmount
  const beforeRounding = taxableValue + (input.reverseCharge ? 0 : taxAmount)
  const total = input.roundOffTotal === false ? beforeRounding : roundToRupee(beforeRounding)
  // TDS is on the value of the service, never on the tax.
  const tdsAmount = input.tdsPercent && input.tdsPercent > 0 ? percentOf(taxableValue, input.tdsPercent) : 0

  return {
    lines,
    subtotal: sumPaise(grossValues),
    discountAmount: sumPaise(lineDiscounts) + headDiscount,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount,
    roundOff: total - beforeRounding,
    total,
    tdsAmount,
    expectedReceipt: total - tdsAmount,
  }
}

/** What is still owed, given payments and credit notes. Never negative. */
export function balanceDue(total: Paise, paid: Paise, credited: Paise): Paise {
  return Math.max(0, total - paid - credited)
}
