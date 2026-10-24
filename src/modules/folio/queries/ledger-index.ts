import 'server-only'
import type { Types } from 'mongoose'
import { todayIST } from '@/lib/dates'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { balancesByClient, type ClientBalance } from './balances'
import { BILLED_STATUSES, clientNameMap, profileSummaries, type FolioScope } from './common'

export type LedgerIndexRow = ClientBalance & { termsDays: number | null; lastBilled: string | null }

/** Every client with Folio activity (an issued invoice or a payment), with balances. Overdue first, then by name. */
export async function ledgerIndex(scope: FolioScope, opts: { q?: string; overdueOnly?: boolean } = {}): Promise<LedgerIndexRow[]> {
  const today = todayIST()
  const [balances, billed, paidIds] = await Promise.all([
    balancesByClient(scope, today),
    scope.db(Invoice).aggregate<{ _id: Types.ObjectId; last: string }>([
      { $match: { status: { $in: [...BILLED_STATUSES] } } },
      { $group: { _id: '$clientId', last: { $max: { $cond: [{ $eq: ['$billingType', 'opening'] }, null, '$issueDate'] } } } },
    ]),
    scope.db(FolioReceipt).distinct('clientId', {}),
  ])
  const ids = [...new Set([...balances.map((b) => b.clientId), ...billed.map((b) => String(b._id)), ...(paidIds as unknown[]).map(String)])]
  const [names, profiles] = await Promise.all([clientNameMap(scope, ids), profileSummaries(scope, ids)])
  const byClient = new Map(balances.map((b) => [b.clientId, b]))
  const last = new Map(billed.map((b) => [String(b._id), b.last]))
  const needle = opts.q?.toLowerCase().trim()
  return ids
    .filter((id) => names.has(id))
    .map((id) => ({
      ...(byClient.get(id) ?? { clientId: id, clientName: '', outstandingPaise: 0, overduePaise: 0, oldestDueDate: null, openInvoices: 0, unappliedCreditPaise: 0, netReceivablePaise: 0 }),
      clientName: names.get(id) ?? 'Unknown client',
      termsDays: profiles.get(id)?.termsDays ?? null,
      lastBilled: last.get(id) ?? null,
    }))
    .filter((r) => (!needle || r.clientName.toLowerCase().includes(needle)) && (!opts.overdueOnly || r.overduePaise > 0))
    .sort((a, b) => b.overduePaise - a.overduePaise || a.clientName.localeCompare(b.clientName))
}
