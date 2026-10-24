import { GST_NUMBERED_KINDS, longestPrefix, MAX_DOCUMENT_NUMBER_LENGTH, seriesNumberLength, type FyFormat, type SeriesKind } from './numbering'

/**
 * The 16-character check for a number series (CGST Rule 46(b)), shared by the
 * settings form, the entity model and the read-only audit script.
 */

export type SeriesPrefixes = {
  invoicePrefix: string
  creditNotePrefix: string
  receiptPrefix: string
  quotePrefix: string
  proformaPrefix: string
  padding?: number | null
  fyFormat?: string | null
}

export type SeriesField = 'invoicePrefix' | 'creditNotePrefix' | 'receiptPrefix'
export type SeriesProblem = { field: SeriesField; message: string }

/** Below this, suggest fewer digits or the short year rather than a tiny prefix. */
const MIN_USEFUL_PREFIX = 2

const FIELD_OF: Partial<Record<SeriesKind, { field: SeriesField; label: string }>> = {
  invoice: { field: 'invoicePrefix', label: 'Invoice' },
  credit_note: { field: 'creditNotePrefix', label: 'Credit note' },
  receipt: { field: 'receiptPrefix', label: 'Receipt' },
}

/** One problem per GST series whose numbers would run past 16 characters (empty: all fit). */
export function seriesLengthProblems(series: SeriesPrefixes): SeriesProblem[] {
  const padding = series.padding ?? 4
  const format: FyFormat = series.fyFormat === 'short' ? 'short' : 'long'
  const max = longestPrefix(padding, format)
  return GST_NUMBERED_KINDS.flatMap((kind) => {
    const spec = FIELD_OF[kind]
    if (!spec) return []
    const prefix = series[spec.field] ?? ''
    if (seriesNumberLength(prefix, padding, format) <= MAX_DOCUMENT_NUMBER_LENGTH) return []
    const message = max >= MIN_USEFUL_PREFIX
      ? `${spec.label} numbers would be longer than ${MAX_DOCUMENT_NUMBER_LENGTH} characters. With ${padding} digits and this year format, use a prefix of at most ${max} characters.`
      : `${spec.label} numbers would be longer than ${MAX_DOCUMENT_NUMBER_LENGTH} characters. Use fewer digits or the short year (26-27).`
    return [{ field: spec.field, message }]
  })
}
