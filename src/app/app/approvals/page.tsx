import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, ClipboardCheck } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { pluralize } from '@/lib/utils'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { approvalsInbox, pendingTotal, type ApprovalGroup } from '@/modules/approvals/inbox'

export const metadata: Metadata = { title: 'Approvals' }
const BASE = '/app/approvals'

function GroupCard({ group }: { group: ApprovalGroup }) {
  const more = group.total - group.items.length
  return (
    <Card>
      <CardHeader
        label={group.label}
        description={group.total ? `${group.total} waiting on you` : 'Nothing waiting'}
        actions={
          <Link href={group.queueHref} className="inline-flex items-center gap-1 text-[13px] text-fg-2 hover:text-fg">
            {group.queueLabel} <ChevronRight className="size-3.5" />
          </Link>
        }
        className={group.items.length ? undefined : 'mb-0'}
      />
      {group.items.length ? (
        <ul className="divide-y divide-line-soft">
          {group.items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-white">
                <span className="min-w-0">
                  <span className="font-medium text-fg">{item.who}</span>
                  <span className="block truncate text-[13px] text-fg-2">{item.what}</span>
                </span>
                {item.when ? <span className="shrink-0 text-xs text-fg-3">{item.when}</span> : null}
              </Link>
            </li>
          ))}
          {more > 0 ? (
            <li className="pt-2.5">
              <Link href={group.queueHref} className="text-[13px] text-fg-2 hover:text-fg">
                {more} more in {group.queueLabel.replace(/^Open /, '')}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </Card>
  )
}

/** Approvals inbox (audit A11): every request waiting on the signed-in member, grouped by kind, oldest first. */
export default async function ApprovalsPage() {
  const ctx = await requireMember()
  const groups = await approvalsInbox(ctx)
  const total = pendingTotal(groups)
  return (
    <>
      <PageHeader
        title="Approvals"
        help="manager-role"
        description={groups.length ? `Everything waiting on your decision, oldest first. ${total ? pluralize(total, 'request') + ' in all.' : 'You are all caught up.'}` : 'Requests that need your decision appear here.'}
        breadcrumb={breadcrumbFor(BASE)}
        icon={<ClipboardCheck />}
      />
      {groups.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[...groups].sort((a, b) => Number(b.total > 0) - Number(a.total > 0)).map((g) => (
            <GroupCard key={g.kind} group={g} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<ClipboardCheck />} title="Nothing for you to approve" description="Your role does not decide leave, corrections, claims, bank changes or timesheets. When it does, they appear here." />
        </Card>
      )}
    </>
  )
}
