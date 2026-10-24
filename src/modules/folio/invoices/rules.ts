/**
 * Pure integrity rules for invoices, enforced by the model hooks and unit
 * tested here (they replace BillingOS's database CHECK constraints).
 */

/** Fields an issued invoice may never change. Everything else (settlement, void, write-off, notes) stays writable. */
export const FROZEN_FIELDS = [
  'number', 'fyLabel', 'entityId', 'clientId', 'documentType', 'issueDate', 'dueDate', 'supplyType', 'placeOfSupplyStateCode',
  'clientGstin', 'entityGstin', 'reverseCharge', 'billTo', 'from', 'subtotalPaise', 'discountPaise', 'taxablePaise',
  'cgstPaise', 'sgstPaise', 'igstPaise', 'roundOffPaise', 'totalPaise', 'tdsPercent', 'tdsPaise', 'lines',
] as const

/** Printed under a reverse-charge total, which leaves out the GST shown above it. */
export const reverseChargeNote = (taxPaise: number, format: (paise: number) => string): string => `GST of ${format(taxPaise)} is payable by the recipient under reverse charge.`

/** Credit notes: everything but the cancel fields and status. */
export const CREDIT_NOTE_FROZEN = ['number', 'fyLabel', 'seq', 'entityId', 'clientId', 'invoiceId', 'documentType', 'noteDate', 'reason', 'reasonText', 'supplyType', 'reverseCharge', 'lines', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'roundOffPaise', 'totalPaise'] as const

export type CoherenceInput = {
  status: string
  number?: string | null
  issueDate?: string | null
  dueDate?: string | null
  documentType: string
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  entityGstin?: string | null
  reverseCharge?: boolean | null
}

/** The first rule a document breaks, or null. */
export function invoiceCoherenceError(doc: CoherenceInput): string | null {
  if (doc.status === 'draft' && doc.number) return 'A draft invoice cannot hold a number.'
  if (doc.status !== 'draft' && !doc.number) return 'An issued invoice must have a number.'
  if (doc.issueDate && doc.dueDate && doc.dueDate < doc.issueDate) return 'The due date cannot fall before the invoice date.'
  return taxCoherenceError(doc)
}

/** Tax rules shared by invoices, quotes and credit notes. */
export function taxCoherenceError(doc: Pick<CoherenceInput, 'documentType' | 'cgstPaise' | 'sgstPaise' | 'igstPaise' | 'entityGstin' | 'reverseCharge'>): string | null {
  if (doc.documentType === 'sale_invoice' && (doc.cgstPaise > 0 || doc.sgstPaise > 0 || doc.igstPaise > 0 || doc.entityGstin || doc.reverseCharge)) {
    return 'A sale invoice cannot carry tax, a GSTIN or reverse charge.'
  }
  if (doc.igstPaise > 0 && (doc.cgstPaise > 0 || doc.sgstPaise > 0)) return 'An invoice cannot charge IGST and CGST/SGST together.'
  if (doc.cgstPaise !== doc.sgstPaise) return 'CGST and SGST must be exactly equal.'
  return null
}

/** Top-level field names an update touches: operator keys split on '.', plus bare keys. */
export function updatedFields(update: unknown): Set<string> {
  const fields = new Set<string>()
  if (!update || typeof update !== 'object' || Array.isArray(update)) return fields
  for (const [key, payload] of Object.entries(update as Record<string, unknown>)) {
    if (key.startsWith('$')) {
      for (const inner of Object.keys((payload as Record<string, unknown>) ?? {})) fields.add(inner.split('.')[0])
    } else {
      fields.add(key.split('.')[0])
    }
  }
  return fields
}

export const touchesFrozen = (update: unknown, frozen: readonly string[] = FROZEN_FIELDS): boolean => {
  const fields = updatedFields(update)
  return frozen.some((f) => fields.has(f))
}

export const lockedMessage = (number: string | null | undefined) => `${number ? `Invoice ${number}` : 'This invoice'} is issued and its figures are locked. Raise a credit note instead.`

/**
 * Why an invoice with a live IRN cannot be voided, or null when it has none.
 * `cancelWindowOpen` is null without an active IRN, else whether its 24-hour
 * cancel window on the IRP is still open.
 */
export function irnVoidRefusal(cancelWindowOpen: boolean | null): string | null {
  if (cancelWindowOpen === null) return null
  return cancelWindowOpen
    ? 'This invoice has an active IRN. Cancel the IRN first (within 24 hours of acknowledgement), then void the invoice.'
    : 'This invoice has an active IRN, and its 24-hour cancel window has passed. Raise a credit note instead.'
}
