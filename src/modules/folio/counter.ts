import type { ClientSession, Types } from 'mongoose'
import { UserError } from '@/lib/errors'
import { nextSeq, peekSeq } from '@/lib/sequence'
import { documentNumberProblem, financialYearOf, formatDocumentNumber, GST_NUMBERED_KINDS, longestPrefix, seriesKey, type FyFormat, type SeriesKind } from './engine/numbering'

/**
 * Gapless series per entity, per document kind, per financial year. Invoice
 * numbers are taken inside the issue transaction, so an aborted issue rolls
 * the counter back with it.
 */

export type SeriesEntity = {
  _id: Types.ObjectId
  series: { invoicePrefix: string; creditNotePrefix: string; receiptPrefix: string; quotePrefix: string; proformaPrefix: string; padding?: number | null; fyFormat?: string | null }
}

const PREFIX_FIELD = { invoice: 'invoicePrefix', credit_note: 'creditNotePrefix', receipt: 'receiptPrefix', quote: 'quotePrefix', proforma: 'proformaPrefix' } as const

export const prefixFor = (entity: SeriesEntity, kind: SeriesKind): string => entity.series[PREFIX_FIELD[kind]]

export type TakenNumber = { number: string; fyLabel: string; seq: number }

/** Series saved before the 16-character rule have no year format: they print the long year. */
const fyFormatOf = (entity: SeriesEntity): FyFormat => (entity.series.fyFormat === 'short' ? 'short' : 'long')

const formatFor = (entity: SeriesEntity, kind: SeriesKind, fyLabel: string, seq: number): string =>
  formatDocumentNumber(prefixFor(entity, kind), fyLabel, seq, entity.series.padding ?? 4, fyFormatOf(entity))

/** Refuses a GST document number over 16 characters (CGST Rule 46(b)); quotes and proformas are not GST documents. */
function assertFits(kind: SeriesKind, number: string): void {
  if (!GST_NUMBERED_KINDS.includes(kind)) return
  const problem = documentNumberProblem(number)
  if (problem) throw new UserError(problem)
}

/** Spends the next number of the entity's `kind` series for the FY of `date`. Pass the transaction session. */
export async function takeNumber(orgId: Types.ObjectId, entity: SeriesEntity, kind: SeriesKind, date: string, session?: ClientSession): Promise<TakenNumber> {
  const fyLabel = financialYearOf(date)
  // Check the series itself before spending a number, then the actual number (a sequence can outgrow its padding).
  assertFits(kind, formatFor(entity, kind, fyLabel, 1))
  const seq = await nextSeq(orgId, seriesKey(kind, String(entity._id), fyLabel), session)
  const number = formatFor(entity, kind, fyLabel, seq)
  assertFits(kind, number)
  return { number, fyLabel, seq }
}

/** What the next number would be, without spending it (display only). */
export async function peekNumber(orgId: Types.ObjectId, entity: SeriesEntity, kind: SeriesKind, date: string): Promise<string> {
  const fyLabel = financialYearOf(date)
  const seq = await peekSeq(orgId, seriesKey(kind, String(entity._id), fyLabel))
  return formatFor(entity, kind, fyLabel, seq)
}

const DEFAULT_PADDING = 4
const DEFAULT_FY_FORMAT: FyFormat = 'short'
/** Letters of the code kept before a two-letter kind suffix (VWX -> VWXCN). */
const SUFFIX_BASE = longestPrefix(DEFAULT_PADDING, DEFAULT_FY_FORMAT) - 2

/**
 * Default series for a new entity code, sized to stay within 16 characters:
 * VWX/26-27/0001, VWXCN, VWXRC, VWXQT, VWXPI. A longer code is shortened
 * (ACMEINDIA -> ACMEI and ACMCN); the admin can change any prefix later.
 */
export function defaultSeries(code: string) {
  const invoicePrefix = code.slice(0, longestPrefix(DEFAULT_PADDING, DEFAULT_FY_FORMAT))
  const base = code.slice(0, SUFFIX_BASE)
  return { invoicePrefix, creditNotePrefix: `${base}CN`, receiptPrefix: `${base}RC`, quotePrefix: `${base}QT`, proformaPrefix: `${base}PI`, padding: DEFAULT_PADDING, fyFormat: DEFAULT_FY_FORMAT }
}
