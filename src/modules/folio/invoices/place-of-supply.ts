import { isTaxable, type SupplyType } from '../engine/gst'

/**
 * R3 L-25b: the CGST+SGST vs IGST split is worked out when a draft is saved.
 * If the place of supply was derived from the client (not picked on the
 * draft) and the client's state or billing-profile place of supply has
 * changed since, the split may be stale, so issue must refuse.
 */
export type PlaceOfSupplyCheck = {
  isTax: boolean
  supplyType: SupplyType
  /** Stored on the draft: the override, or the client's state at save time. */
  placeOfSupplyStateCode: string | null | undefined
  /** The client's derived state at save time; null on drafts saved before this check. */
  clientStateCodeAtSave: string | null | undefined
  /** The client's derived state now (clientStateCode). */
  clientStateCodeNow: string | null
}

export function placeOfSupplyIsStale(c: PlaceOfSupplyCheck): boolean {
  if (!c.isTax || !isTaxable(c.supplyType) || !c.clientStateCodeAtSave) return false
  const wasDerived = c.placeOfSupplyStateCode === c.clientStateCodeAtSave
  return wasDerived && c.clientStateCodeNow !== c.clientStateCodeAtSave
}
