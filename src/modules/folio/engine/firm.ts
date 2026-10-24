/**
 * The firm filter (pure, client-safe): "Combined" or one billing entity,
 * carried in the URL as ?firm=<entity code> so links keep it.
 */

export type FirmOption = { id: string; code: string; name: string }

/** The firm the URL names (by code, any case, or by id); null = Combined or unknown. */
export function pickFirm(firms: readonly FirmOption[], raw: string | null | undefined): FirmOption | null {
  const wanted = raw?.trim()
  if (!wanted || firms.length < 2) return null
  return firms.find((f) => f.code.toUpperCase() === wanted.toUpperCase() || f.id === wanted) ?? null
}

/** "Vistaar WebX" or "all firms", for sentences under a number. */
export const firmPhrase = (firm: FirmOption | null) => (firm ? firm.name : 'all firms')
