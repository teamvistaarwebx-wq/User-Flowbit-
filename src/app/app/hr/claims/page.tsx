import type { Metadata } from 'next'
import { Inbox, Receipt, Settings2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, parseListParams, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { LinkTabs } from '@/components/ui/tabs'
import { FiguresCard } from '@/components/muster/ui/figures'
import { ReviewQueue } from '@/components/muster/claims/review-queue'
import { CLAIM_TABS, claimTotals, listClaims, schedulableCycles, type ClaimTab } from '@/modules/muster/claims/queries'

export const metadata: Metadata = { title: 'Claims' }
const BASE = '/app/hr/claims'

const TAB_LABELS: Record<ClaimTab, string> = { review: 'To review', approved: 'Approved', scheduled: 'In payroll', paid: 'Paid', rejected: 'Rejected', all: 'All' }
const EMPTY: Record<ClaimTab, string> = {
  review: 'Nothing is waiting for review.',
  approved: 'No approved claims are waiting to be paid.',
  scheduled: 'No claims are scheduled into a payroll month.',
  paid: 'No claims have been paid yet.',
  rejected: 'No claims have been rejected.',
  all: 'No claims yet.',
}

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'claims.read' })
  const raw = first(sp.tab)
  const tab: ClaimTab = CLAIM_TABS.includes(raw as ClaimTab) ? (raw as ClaimTab) : 'review'
  const p = parseListParams(sp, { pageSize: 25 })
  const canSchedule = ctx.can('claims.review') && ctx.hasFeature('muster.payroll')
  const [totals, list, cycles] = await Promise.all([claimTotals(ctx), listClaims(ctx, { tab, q: p.q, skip: p.skip, limit: p.pageSize }), canSchedule ? schedulableCycles(ctx) : Promise.resolve([])])

  return (
    <>
      <PageHeader
        title="Claims"
        help="claims-vs-expenses"
        description="Review expense claims (reimbursements), send approved ones to payroll and record what was paid. Approved claims are paid with salary; they never appear in Folio expenses."
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          ctx.can('claims.forms') ? (
            <Button variant="secondary" icon={<Settings2 className="size-4" />} href="/app/hr/claims/forms">
              Forms & categories
            </Button>
          ) : null
        }
      />
      <FiguresCard
        className="mb-3"
        items={[
          { label: 'Pending', value: formatINR(totals.pending.amount, { decimals: 0 }), tone: totals.pending.count ? 'warning' : undefined, hint: `${totals.pending.count} waiting for review` },
          { label: 'Approved', value: formatINR(totals.approved.amount, { decimals: 0 }), hint: `${totals.approved.count} approved or in payroll` },
          { label: 'Paid', value: formatINR(totals.paid.amount, { decimals: 0 }), hint: `${totals.paid.count} paid` },
          { label: 'Rejected', value: formatINR(totals.rejected.amount, { decimals: 0 }), hint: `${totals.rejected.count} rejected` },
        ]}
      />
      <ReviewQueue
        label="Claims"
        icon={<Receipt />}
        description={`${list.total} ${list.total === 1 ? 'claim' : 'claims'} · ${TAB_LABELS[tab].toLowerCase()}`}
        actions={
          <>
            <LinkTabs tabs={CLAIM_TABS.map((t) => ({ href: t === 'review' ? BASE : `${BASE}?tab=${t}`, label: TAB_LABELS[t], ...(t === 'review' ? { count: totals.pending.count } : {}) }))} />
            <SearchInput placeholder="Search person or purpose" className="w-full sm:w-64" />
          </>
        }
        rows={list.rows}
        tab={tab}
        canReview={ctx.can('claims.review')}
        canPay={ctx.can('claims.pay')}
        canSchedule={canSchedule}
        cycles={cycles}
        empty={
          <EmptyState
            compact
            icon={<Inbox />}
            title={p.q ? `No claims match "${p.q}"` : EMPTY[tab]}
            description={tab === 'all' && !p.q ? 'Create a claim form and share its link so the team can submit expenses.' : undefined}
            action={tab === 'all' && ctx.can('claims.forms') && !p.q ? <Button variant="primary" href="/app/hr/claims/forms">Create a claim form</Button> : undefined}
          />
        }
      />
      <Pagination page={p.page} pageSize={p.pageSize} total={list.total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
