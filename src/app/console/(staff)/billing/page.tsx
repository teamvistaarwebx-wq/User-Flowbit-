import type { Metadata } from 'next'
import { requireStaff } from '@/lib/console/session'
import { todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { FilterPills } from '@/components/settings/filter-pills'
import { OfflinePayment } from '@/models/billing/OfflinePayment'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { dueTotals } from '@/modules/billing/due-totals'
import { CreditNotes, DueBills, Invoices, OfflineQueue, Overdue, TdsTracking } from './sections'

export const metadata: Metadata = { title: 'Billing' }
export const maxDuration = 300

const TABS = [
  { key: 'due', label: 'Due bills' },
  { key: 'offline', label: 'Verify payments' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'tds', label: 'TDS' },
  { key: 'credits', label: 'Credit notes' },
] as const

/** Console Billing (console spec 7.2, 11): due bills and links, offline verification, overdue, invoices, TDS, credit notes. */
export default async function ConsoleBillingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await requireStaff('billing.view')
  const sp = await searchParams
  const tab = TABS.some((t) => t.key === first(sp.tab)) ? first(sp.tab)! : 'due'
  const today = todayIST()
  const [dueBills, toVerify] = await Promise.all([
    p.raw(SubscriptionInvoice).find({ status: 'due' }, { totalPaise: 1, taxableValuePaise: 1, receivedPaise: 1, tds: 1, dueDate: 1 }).lean(),
    p.raw(OfflinePayment).countDocuments({ status: { $in: ['pending', 'expired'] } }),
  ])
  // What the due bills still ask for, net of TDS declared and part payments (as each bill row shows).
  const due = dueTotals(dueBills, today)
  return (
    <>
      <PageHeader title="Billing" description="Flowbit's own bills, payments and tax records.">
        <FilterPills label="Billing sections" items={TABS.map((t) => ({ href: buildHref('/console/billing', {}, { tab: t.key === 'due' ? undefined : t.key }), label: t.label, active: tab === t.key }))} />
      </PageHeader>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Due" value={formatINR(due.duePaise)} hint={`${due.dueCount} bills`} />
        <StatCard label="To verify" value={String(toVerify)} hint="offline payments" />
        <StatCard label="Overdue bills" value={String(due.overdueCount)} hint={`${formatINR(due.overduePaise)} past the due date`} />
      </div>
      {tab === 'due' ? <DueBills p={p} /> : null}
      {tab === 'offline' ? <OfflineQueue p={p} /> : null}
      {tab === 'overdue' ? <Overdue p={p} /> : null}
      {tab === 'invoices' ? <Invoices p={p} /> : null}
      {tab === 'tds' ? <TdsTracking p={p} /> : null}
      {tab === 'credits' ? <CreditNotes p={p} /> : null}
    </>
  )
}
