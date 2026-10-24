import { gstCodeFromAny, gstCodeFromStateLetters } from './states'

/**
 * GST treatment (port of BillingOS `lib/invoice/gst.ts`). Both decisions,
 * whether tax applies and whether it is CGST+SGST or IGST, are made on the
 * server and frozen onto the document at issue.
 */

export type DocumentType = 'tax_invoice' | 'sale_invoice'
export type SupplyType = 'intra_state' | 'inter_state' | 'export' | 'sez' | 'exempt'

/** 2 state digits, 10 PAN, 1 entity, 'Z', 1 check. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase())
}

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(value.trim().toUpperCase())
}

/** The first two characters of a valid GSTIN; null otherwise. */
export function stateCodeOfGstin(gstin: string): string | null {
  const normalised = gstin.trim().toUpperCase()
  return isValidGstin(normalised) ? normalised.slice(0, 2) : null
}

/** Characters 3–12 of a valid GSTIN (the holder's PAN). */
export function panOfGstin(gstin: string): string | null {
  const normalised = gstin.trim().toUpperCase()
  return isValidGstin(normalised) ? normalised.slice(2, 12) : null
}

/** True when the GSTIN's state digits equal `stateCode` (a GST numeric code). */
export function gstinMatchesState(gstin: string, stateCode: string): boolean {
  const embedded = stateCodeOfGstin(gstin)
  return embedded !== null && embedded === stateCode
}

export type SupplyContext = {
  documentType: DocumentType
  entityStateCode: string | null
  placeOfSupplyStateCode: string | null
  isExport?: boolean
  isSez?: boolean
}

/**
 * A sale invoice is always exempt. Without both states, inter-state: IGST
 * charged in error is recoverable by the client, a wrong CGST/SGST split is not.
 */
export function resolveSupplyType(context: SupplyContext): SupplyType {
  if (context.documentType === 'sale_invoice') return 'exempt'
  if (context.isExport) return 'export'
  if (context.isSez) return 'sez'
  const { entityStateCode, placeOfSupplyStateCode } = context
  if (!entityStateCode || !placeOfSupplyStateCode) return 'inter_state'
  return entityStateCode === placeOfSupplyStateCode ? 'intra_state' : 'inter_state'
}

/** Zero-rated and exempt supplies carry no tax, whatever rate was entered. */
export function isTaxable(supplyType: SupplyType): boolean {
  return supplyType === 'intra_state' || supplyType === 'inter_state'
}

export const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  intra_state: 'Intra-state (CGST + SGST)',
  inter_state: 'Inter-state (IGST)',
  export: 'Export (zero-rated)',
  sez: 'SEZ supply (zero-rated)',
  exempt: 'Not taxable',
}

export type ClientForState = {
  gstin?: string | null
  state?: string | null
  billingAddress?: { state?: string | null } | null
}

/**
 * The client's GST state code, in priority order: the billing profile's
 * place-of-supply override, a valid GSTIN, `Client.state` letters, then the
 * billing address state (letters or name).
 */
export function clientStateCode(client: ClientForState, profile?: { placeOfSupplyStateCode?: string | null } | null): string | null {
  if (profile?.placeOfSupplyStateCode) return profile.placeOfSupplyStateCode
  const fromGstin = client.gstin ? stateCodeOfGstin(client.gstin) : null
  if (fromGstin) return fromGstin
  return gstCodeFromStateLetters(client.state) ?? gstCodeFromAny(client.billingAddress?.state)
}

/** "GST registered" is derived from a valid GSTIN. */
export const clientIsRegistered = (client: { gstin?: string | null }): boolean => Boolean(client.gstin && isValidGstin(client.gstin))
