import { StatusPill } from '@/components/ui/badge'

/** recorded = success, bounced = danger, cancelled = neutral. */
export function ReceiptStatusBadge({ status }: { status: string }) {
  if (status === 'recorded') return <StatusPill status="paid" label="Recorded" />
  if (status === 'bounced') return <StatusPill status="overdue" label="Bounced" />
  return <StatusPill status="void" label="Cancelled" />
}
