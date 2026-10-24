import { resolveSupplyType, type DocumentType, type SupplyType } from '../engine/gst'
import { computeInvoice, type ComputedInvoice, type DiscountType } from '../engine/totals'
import type { SupplyMode } from '../types'

/**
 * Prices an invoice or quote from plain values. Pure and client-safe: the
 * builder runs it for the live preview and the server runs it again on
 * every save, so the two can never disagree. The server never trusts posted totals.
 */

export type DraftLine = {
  serviceItemId?: string | null
  description: string
  hsnSac?: string | null
  quantity: number
  unit: string
  ratePaise: number
  discountPercent: number
  gstRatePercent: number
}

export type PriceContext = {
  entityKind: 'gst' | 'non_gst'
  entityStateCode: string | null
  /** The client's derived GST state code (see clientStateCode). */
  clientStateCode: string | null
  /** Override on the document; blank means "from the client". */
  placeOfSupplyStateCode?: string | null
  supplyMode: SupplyMode
  lines: readonly DraftLine[]
  discountType: DiscountType | null
  /** Percent number, or paise when `amount`. */
  discountValue: number
  tdsPercent: number
  roundOffTotal: boolean
  /** Reverse charge (tax invoices to a registered client): GST shown but not billed. */
  reverseCharge?: boolean
}

export type PricedLine = DraftLine & {
  position: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  lineTotalPaise: number
}

export type PricedDocument = {
  documentType: DocumentType
  supplyType: SupplyType
  placeOfSupplyStateCode: string | null
  lines: PricedLine[]
  subtotalPaise: number
  discountType: DiscountType | null
  discountValue: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  roundOffPaise: number
  totalPaise: number
  tdsPercent: number
  tdsPaise: number
  expectedReceiptPaise: number
}

export const documentTypeOf = (kind: 'gst' | 'non_gst'): DocumentType => (kind === 'gst' ? 'tax_invoice' : 'sale_invoice')

export function priceDocument(input: PriceContext): PricedDocument {
  const documentType = documentTypeOf(input.entityKind)
  const place = input.placeOfSupplyStateCode || input.clientStateCode || null
  const supplyType = resolveSupplyType({
    documentType,
    entityStateCode: input.entityStateCode,
    placeOfSupplyStateCode: place,
    isExport: input.supplyMode === 'export',
    isSez: input.supplyMode === 'sez',
  })
  const isSale = documentType === 'sale_invoice'
  const computed: ComputedInvoice = computeInvoice({
    lines: input.lines.map((l) => ({ description: l.description, quantity: l.quantity, rate: l.ratePaise, discountPercent: l.discountPercent, gstRatePercent: isSale ? 0 : l.gstRatePercent })),
    supplyType,
    discountType: input.discountType,
    discountValue: input.discountValue,
    roundOffTotal: input.roundOffTotal,
    tdsPercent: input.tdsPercent,
    reverseCharge: !isSale && Boolean(input.reverseCharge),
  })
  return {
    documentType,
    supplyType,
    placeOfSupplyStateCode: isSale ? null : place,
    lines: input.lines.map((line, i) => {
      const c = computed.lines[i]
      return { ...line, position: i + 1, gstRatePercent: c.gstRatePercent, discountPaise: c.discountAmount, taxablePaise: c.taxableValue, cgstPaise: c.cgstAmount, sgstPaise: c.sgstAmount, igstPaise: c.igstAmount, lineTotalPaise: c.lineTotal }
    }),
    subtotalPaise: computed.subtotal,
    discountType: input.discountType,
    discountValue: input.discountType ? input.discountValue : 0,
    discountPaise: computed.discountAmount,
    taxablePaise: computed.taxableValue,
    cgstPaise: computed.cgstAmount,
    sgstPaise: computed.sgstAmount,
    igstPaise: computed.igstAmount,
    roundOffPaise: computed.roundOff,
    totalPaise: computed.total,
    tdsPercent: input.tdsPercent,
    tdsPaise: computed.tdsAmount,
    expectedReceiptPaise: computed.expectedReceipt,
  }
}

/** The fields of a priced document that are stored on Invoice/Quote. */
export function storedPricing(p: PricedDocument) {
  return {
    documentType: p.documentType,
    supplyType: p.supplyType,
    placeOfSupplyStateCode: p.placeOfSupplyStateCode,
    subtotalPaise: p.subtotalPaise,
    discountType: p.discountType,
    discountValue: p.discountValue,
    discountPaise: p.discountPaise,
    taxablePaise: p.taxablePaise,
    cgstPaise: p.cgstPaise,
    sgstPaise: p.sgstPaise,
    igstPaise: p.igstPaise,
    roundOffPaise: p.roundOffPaise,
    totalPaise: p.totalPaise,
    lines: p.lines.map((l) => ({
      position: l.position, serviceItemId: l.serviceItemId || null, description: l.description, hsnSac: l.hsnSac || null, quantity: l.quantity, unit: l.unit,
      ratePaise: l.ratePaise, discountPercent: l.discountPercent, discountPaise: l.discountPaise, taxablePaise: l.taxablePaise, gstRatePercent: l.gstRatePercent,
      cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise, igstPaise: l.igstPaise, lineTotalPaise: l.lineTotalPaise,
    })),
  }
}
