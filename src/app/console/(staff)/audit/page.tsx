import type { Metadata } from 'next'
import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { STAFF_ROLE_LABEL, isStaffRole } from '@/lib/console/roles'
import { requireStaff } from '@/lib/console/session'
import { formatDateTime } from '@/lib/dates'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableCard } from '@/components/settings/surface'
import { StaffAudit } from '@/models/console/StaffAudit'

export const metadata: Metadata = { title: 'Audit' }

/** Every Console action, by staff member (console spec 7.1), newest first. */
export default async function ConsoleAuditPage() {
  const p = await requireStaff('staff.manage')
  const rows = await p.raw(StaffAudit).find({}).sort({ createdAt: -1 }).limit(200).lean()
  return (
    <>
      <PageHeader title="Audit" description="The latest 200 Console actions. Actions on a workspace are also in that workspace's own audit log." />
      <TableCard icon={<ScrollText strokeWidth={1.5} />} label="Console actions">
        {rows.length ? (
          <ul className="border-t border-line py-1.5">
            {rows.map((r) => (
              <li key={String(r._id)} className="flex flex-col gap-0.5 px-[23px] py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className="min-w-0">
                  <span className="block text-white">{r.summary}</span>
                  <span className="font-mono text-[11px] text-[#979797]">{r.action}</span>
                  {r.orgId ? <Link href={`/console/accounts/${r.orgId}`} className="ml-2 text-xs text-link">account</Link> : null}
                </span>
                <span className="shrink-0 text-xs text-[#979797]">{r.staffName} ({isStaffRole(r.staffRole) ? STAFF_ROLE_LABEL[r.staffRole] : r.staffRole}) · {formatDateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-line"><EmptyState compact icon={<ScrollText />} title="Nothing recorded yet" /></div>
        )}
      </TableCard>
    </>
  )
}
