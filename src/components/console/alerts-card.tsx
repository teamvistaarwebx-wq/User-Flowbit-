'use client'

import Link from 'next/link'
import { BellRing, CheckCheck } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableCard } from '@/components/settings/surface'
import { markAlertsRead } from '@/modules/console/crm-actions'

export type AlertRow = { id: string; orgId: string; title: string; at: string; mine: boolean }

/** Limit hits and Upgrade clicks from the accounts (console spec 8), newest first. */
export function AlertsCard({ rows }: { rows: AlertRow[] }) {
  const [run, pending] = useAction(markAlertsRead)
  return (
    <TableCard
      icon={<BellRing strokeWidth={1.5} />}
      label="Alerts"
      description="Limit hits and Upgrade clicks: yours, and unassigned accounts"
      actions={rows.length ? <Button size="sm" variant="ghost" icon={<CheckCheck className="size-3.5" />} loading={pending} onClick={() => run({})}>Mark all read</Button> : null}
    >
      {rows.length ? (
        <ul className="border-t border-line py-1.5">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/console/accounts/${a.orgId}`} className="flex items-center justify-between gap-3 px-[23px] py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                <span className="min-w-0 truncate text-white">{a.title}</span>
                <span className="shrink-0 text-xs text-[#979797]">{a.mine ? 'Yours · ' : ''}{new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-line">
          <EmptyState compact icon={<BellRing />} title="No new alerts" />
        </div>
      )}
    </TableCard>
  )
}
