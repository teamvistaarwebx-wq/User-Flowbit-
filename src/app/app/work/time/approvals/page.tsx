import type { Metadata } from 'next'
import { ClipboardList } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { LinkTabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { ApprovalsList } from '@/components/work/time/approvals-list'
import { APPROVAL_TABS, approvalSheets, type ApprovalTab } from '@/modules/work/time/approvals'

export const metadata: Metadata = { title: 'Time approvals' }

const LABELS: Record<ApprovalTab, string> = { submitted: 'Pending', approved: 'Approved', rejected: 'Sent back' }

export default async function TimeApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'time.approve' })
  const requested = first(sp.status) as ApprovalTab | undefined
  const tab: ApprovalTab = requested && APPROVAL_TABS.includes(requested) ? requested : 'submitted'
  const { sheets, counts } = await approvalSheets(ctx, tab)
  return (
    <>
      <PageHeader title="Time approvals" description="Review submitted weeks, approve them or send them back with a reason." breadcrumb={breadcrumbFor('/app/work/time/approvals')} back={{ href: '/app/work/time', label: 'My time' }} icon={<ClipboardList />}>
        <LinkTabs tabs={APPROVAL_TABS.map((s) => ({ href: s === 'submitted' ? '/app/work/time/approvals' : `/app/work/time/approvals?status=${s}`, label: LABELS[s], count: counts[s] }))} />
      </PageHeader>
      <ApprovalsList sheets={sheets} tab={tab} />
    </>
  )
}
