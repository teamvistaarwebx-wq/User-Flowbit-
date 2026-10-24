import { Download, Receipt, ScrollText, Users } from 'lucide-react'
import { maskSensitiveText } from '@/lib/console/mask'
import type { StaffCtx } from '@/lib/console/session'
import { formatDate, formatDateTime, timeAgo } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { roleLabel } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusWord, TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { CancelInvoiceButton } from '@/components/console/org-actions'
import { AuditLog } from '@/models/AuditLog'
import { Role } from '@/models/Role'
import { Session } from '@/models/Session'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'

/** Account detail tabs that list records: Flowbit invoices, members, audit. */

type Scoped = ReturnType<StaffCtx['forOrg']>

export async function InvoicesTab({ scoped, canCancel }: { scoped: Scoped; canCancel: boolean }) {
  const invoices = await scoped.db(SubscriptionInvoice).find({}).sort({ issueDate: -1, createdAt: -1 }).limit(200).lean()
  return (
    <TableCard icon={<Receipt strokeWidth={1.5} />} label="Invoices" description="Flowbit bills and tax invoices of this workspace (cancel or record payments for due bills on the Billing page)">
      {invoices.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={tableHead}>
                <th scope="col" className={th}>Number</th>
                <th scope="col" className={th}>Date</th>
                <th scope="col" className={cn(th, 'text-right')}>Total</th>
                <th scope="col" className={th}>Payment</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={String(i._id)} className={tableRow}>
                  <td className={cn(td, 'whitespace-nowrap text-white')}>{i.number}</td>
                  <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{formatDate(i.issueDate)}</td>
                  <td className={cn(td, 'text-right tabular-nums text-white')}>{formatINR(i.totalPaise, { decimals: 2 })}</td>
                  <td className={cn(td, 'text-[#979797]')}>{i.payment?.provider === 'simulated' ? 'Test' : `${i.payment?.provider ?? ''} ${i.payment?.paymentId ?? ''}`}</td>
                  <td className={td}><StatusWord status={i.status === 'cancelled' ? 'cancelled' : i.status === 'due' ? 'pending' : 'paid'} label={i.status === 'cancelled' ? `Cancelled · ${i.cancelReason ?? ''}` : i.status === 'due' ? `Due ${formatDate(i.dueDate ?? i.issueDate)}` : 'Paid'} /></td>
                  <td className={td}>
                    <span className="flex justify-end gap-1">
                      <a href={`/api/subscription/invoices/${i._id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}><Download className="size-3.5" strokeWidth={1.5} /> PDF</a>
                      {i.status === 'paid' && canCancel ? <CancelInvoiceButton invoiceId={String(i._id)} number={i.number} /> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-line">
          <EmptyState compact icon={<Receipt />} title="No invoices yet." />
        </div>
      )}
    </TableCard>
  )
}

export async function lastSeenByUser(p: StaffCtx, orgId: unknown): Promise<Map<string, Date>> {
  const rows = await p.raw(Session).aggregate<{ _id: unknown; at: Date }>([{ $match: { activeOrgId: orgId } }, { $group: { _id: '$userId', at: { $max: '$lastSeenAt' } } }])
  return new Map(rows.map((r) => [String(r._id), r.at]))
}

export async function MembersTab({ members, scoped, lastSeen: seenMap }: { members: { id: string; name: string; email: string; role: string; status: string; userId: string }[]; scoped: Scoped; lastSeen: Map<string, Date> }) {
  const customRoles = await scoped.db(Role).find({ builtIn: false }).lean()
  const lastSeen = (uid: string) => seenMap.get(uid)
  return (
    <TableCard icon={<Users strokeWidth={1.5} />} label="Members" description={`${members.length} ${members.length === 1 ? 'person' : 'people'}, including invites and disabled`}>
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className={tableHead}>
              <th scope="col" className={th}>Person</th>
              <th scope="col" className={th}>Role</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Last active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const seen = lastSeen(m.userId)
              return (
                <tr key={m.id} className={tableRow}>
                  <td className={td}><span className="block text-white">{m.name}</span><span className="text-xs text-[#979797]">{m.email}</span></td>
                  <td className={cn(td, 'text-white')}>{roleLabel(m.role, customRoles)}</td>
                  <td className={td}><StatusWord status={m.status} /></td>
                  <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{seen ? timeAgo(seen) : 'Never'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </TableCard>
  )
}

/** `showWorkspace`: the workspace's own rows only for an Admin with an active read grant, with amounts, PANs and account numbers masked (D3). */
export async function AuditTab({ scoped, showWorkspace }: { scoped: Scoped; showWorkspace: boolean }) {
  const [platformRows, latest] = await Promise.all([
    scoped.db(AuditLog).find({ platform: true }).sort({ createdAt: -1 }).limit(50).lean(),
    showWorkspace ? scoped.db(AuditLog).find({ platform: { $ne: true } }).sort({ createdAt: -1 }).limit(50).lean() : Promise.resolve([]),
  ])
  const list = (title: string, rows: typeof latest) => (
    <TableCard icon={<ScrollText strokeWidth={1.5} />} label={title} description="Latest 50 entries">
      {rows.length ? (
        <ul className="border-t border-line py-1.5">
          {rows.map((r) => (
            <li key={String(r._id)} className="flex flex-col gap-1 px-[23px] py-2.5 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-white">{r.platform ? r.summary : maskSensitiveText(r.summary)}</span>
                <span className={cn('mt-0.5 block font-mono text-[11px]', r.action.startsWith('platform.') ? 'text-[#FF6A66]' : 'text-[#979797]')}>{r.action}</span>
                {(r.meta as { reason?: string } | undefined)?.reason ? <span className="block text-xs text-[#959596]">Reason: {(r.meta as { reason?: string }).reason}</span> : null}
              </span>
              <span className="text-xs text-[#979797] sm:shrink-0 sm:whitespace-nowrap sm:text-right">{r.actorName ?? '—'} · {formatDateTime(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-line">
          <EmptyState compact icon={<ScrollText />} title="Nothing recorded yet." />
        </div>
      )}
    </TableCard>
  )
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {list('Flowbit team actions', platformRows)}
      {showWorkspace ? list('Latest workspace activity', latest) : null}
    </div>
  )
}
