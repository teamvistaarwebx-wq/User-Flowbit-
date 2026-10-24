/**
 * Number series of Flowbit's own billing documents (console spec 11). Pure.
 *
 * GST tax invoices are numbered per supplier GSTIN and financial year:
 * counter `fb-invoice:<GSTIN>:<FY>`, printed `FB/<FY>/0001`. Before a GSTIN
 * is configured the old counter `fb-invoice:<FY>` stays in use, so every
 * number issued so far keeps its meaning. The first GSTIN series of a year
 * continues from that old counter (same printed prefix), so a number is never
 * printed twice. A second GSTIN (a Pvt Ltd switch, another state) needs its
 * own prefix (FLOWBIT_INVOICE_PREFIX), or its numbers would collide.
 *
 * GST caps a document number at 16 characters, so prefixes are at most 3.
 */

export type Series = Readonly<{ key: string; prefix: string }>

export const DEFAULT_INVOICE_PREFIX = 'FB'
export const MAX_PREFIX_LENGTH = 3
export const MAX_DOCUMENT_NUMBER_LENGTH = 16
const PAD = 4

/** A usable printed prefix: 1–3 letters or digits, upper case; anything else falls back to FB. */
export function cleanPrefix(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{1,3}$/.test(value) ? value : DEFAULT_INVOICE_PREFIX
}

const cleanGstin = (gstin: string | null | undefined) => (gstin ?? '').trim().toUpperCase() || null

/** The counter key used before the series was keyed to the GSTIN. */
export const legacyInvoiceKey = (fy: string) => `fb-invoice:${fy}`

/** The tax-invoice series for this supplier GSTIN (null = not registered yet) and FY. */
export function taxInvoiceSeries(input: { gstin: string | null | undefined; fy: string; prefix?: string | null }): Series {
  const gstin = cleanGstin(input.gstin)
  return {
    key: gstin ? `fb-invoice:${gstin}:${input.fy}` : legacyInvoiceKey(input.fy),
    prefix: `${cleanPrefix(input.prefix)}/${input.fy}/`,
  }
}

/**
 * The counter a new series continues from, or null. Only the default prefix
 * continues the old counter: that is the one that printed the old numbers.
 */
export function seriesSeedKey(series: Series, fy: string): string | null {
  if (series.key === legacyInvoiceKey(fy)) return null
  return series.prefix === `${DEFAULT_INVOICE_PREFIX}/${fy}/` ? legacyInvoiceKey(fy) : null
}

/** Due bills and proformas: not tax documents, their own series. */
export const billSeries = (fy: string): Series => ({ key: `fb-bill:${fy}`, prefix: `FBB/${fy}/` })

/**
 * The credit-note prefix for an invoice prefix: 'FB' → 'FBC' (the numbers
 * issued so far), 'FP' → 'FPC'; a 3-letter invoice prefix 'ABC' → 'CAB', so it
 * stays within 3 characters and never prints like an invoice.
 */
export function creditNotePrefix(invoicePrefix: string | null | undefined): string {
  const base = cleanPrefix(invoicePrefix)
  return base.length <= 2 ? `${base}C` : `C${base.slice(0, 2)}`
}

/**
 * Credit notes follow the supplier GSTIN like invoices ('FBC/2026-27/0001'):
 * the counter is keyed to the GSTIN and the printed prefix to the invoice
 * prefix, so a new GSTIN with its new invoice prefix never repeats an
 * earlier credit-note number (V2-REVIEW M-L4).
 */
export function creditNoteSeries(input: { gstin: string | null | undefined; fy: string; prefix?: string | null }): Series {
  const gstin = cleanGstin(input.gstin)
  return { key: `fb-credit:${gstin ?? 'none'}:${input.fy}`, prefix: `${creditNotePrefix(input.prefix)}/${input.fy}/` }
}

/**
 * The credit-note counter a GSTIN series continues from, or null: the first
 * GSTIN series under the default prefix carries on from the credit notes
 * numbered before a GSTIN was set, so 'FBC/2026-27/0001' is never printed twice.
 */
export function creditNoteSeedKey(series: Series, fy: string): string | null {
  const none = `fb-credit:none:${fy}`
  if (series.key === none) return null
  return series.prefix === `${creditNotePrefix(DEFAULT_INVOICE_PREFIX)}/${fy}/` ? none : null
}

export const formatSeriesNumber = (series: Series, seq: number): string => `${series.prefix}${String(seq).padStart(PAD, '0')}`
