import Link from 'next/link'
import { ChevronRight, ClipboardCheck } from 'lucide-react'
import type { Ctx } from '@/lib/ctx'
import { pluralize } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { approvalsInbox, pendingTotal, visibleQueues } from '@/modules/approvals/inbox'

/** Home: one line with what waits on the member's decision, linking to the Approvals inbox. Hidden when nothing waits. */
export async function ApprovalsCard({ ctx }: { ctx: Ctx }) {
  if (!visibleQueues(ctx).length) return null
  const groups = await approvalsInbox(ctx)
  const total = pendingTotal(groups)
  if (!total) return null
  const parts = groups.filter((g) => g.total).map((g) => `${g.total} ${g.label.toLowerCase()}`)
  return (
    <Card padded={false} className="animate-slide-up">
      <Link href="/app/approvals" className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]">
        <ClipboardCheck className="size-5 shrink-0 text-fg" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">{pluralize(total, 'approval')} waiting on you</span>
          <span className="block truncate text-[13px] text-fg-2">{parts.join(' · ')}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-2" />
      </Link>
    </Card>
  )
}
