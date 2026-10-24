import 'server-only'
import type { ClientSession } from 'mongoose'
import { fiscalYear } from '@/lib/dates'
import { flowbitSupplier, serverEnv } from '@/lib/env'
import { nextSeq, PLATFORM_ORG_ID } from '@/lib/sequence'
import { Counter } from '@/models/Counter'
import { billSeries, creditNoteSeedKey, creditNoteSeries, formatSeriesNumber, seriesSeedKey, taxInvoiceSeries, type Series } from './series'

/**
 * Numbers for Flowbit's own documents (series rules in ./series). Call inside
 * the transaction that creates the document, so a rollback never burns one.
 */

export type IssuedNumber = { number: string; fy: string; seq: number; seriesKey: string }

/** A new series continues the counter it replaces (the numbers printed before the GSTIN was set). */
async function continueFrom(series: Series, seed: string | null, session?: ClientSession): Promise<void> {
  if (!seed) return
  const legacy = await Counter.findOne({ orgId: PLATFORM_ORG_ID, key: seed }, { value: 1 }).session(session ?? null).lean()
  if (legacy?.value) await Counter.updateOne({ orgId: PLATFORM_ORG_ID, key: series.key }, { $max: { value: legacy.value } }, { upsert: true, session })
}

async function take(series: Series, fy: string, session?: ClientSession): Promise<IssuedNumber> {
  const seq = await nextSeq(PLATFORM_ORG_ID, series.key, session)
  return { number: formatSeriesNumber(series, seq), fy, seq, seriesKey: series.key }
}

/** The next GST tax invoice number for the configured supplier GSTIN. */
export async function nextTaxNumber(issueDate: string, session?: ClientSession): Promise<IssuedNumber> {
  const fy = fiscalYear(issueDate)
  const series = taxInvoiceSeries({ gstin: flowbitSupplier().gstin, fy, prefix: serverEnv().FLOWBIT_INVOICE_PREFIX })
  // The first GSTIN series of a year continues the numbers printed before it.
  await continueFrom(series, seriesSeedKey(series, fy), session)
  return take(series, fy, session)
}

export const nextBillNumber = (issueDate: string, session?: ClientSession) => take(billSeries(fiscalYear(issueDate)), fiscalYear(issueDate), session)

/** The next credit-note number: counter per supplier GSTIN, prefix from the invoice prefix (V2-REVIEW M-L4). */
export async function nextCreditNoteNumber(issueDate: string, session?: ClientSession): Promise<IssuedNumber> {
  const fy = fiscalYear(issueDate)
  const series = creditNoteSeries({ gstin: flowbitSupplier().gstin, fy, prefix: serverEnv().FLOWBIT_INVOICE_PREFIX })
  await continueFrom(series, creditNoteSeedKey(series, fy), session)
  return take(series, fy, session)
}
