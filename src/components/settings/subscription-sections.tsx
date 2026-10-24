import Link from 'next/link'
import { Clock, CreditCard, Download, Gauge, History, Lock } from 'lucide-react'
import type { CapacityRow } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Progress } from '@/components/ui/progress'
import { EmailInvoiceButton } from './subscription-buttons'
import { StatusWord, TableCard, tableHead, tableRow, td, th } from './surface'
import { COMPANY_LEGAL_NAME } from '@/lib/company'

/** One meter per plan limit; at the limit the fill turns amber. */
export function UsageCard({ rows, trial }: { rows: CapacityRow[]; trial: boolean }) {
  return (
    <Card variant="solid" className="h-full">
      <CardHeader label="Usage" icon={<Gauge strokeWidth={1.5} />} description={trial ? 'No limits during the trial. Your plan will be priced on these numbers.' : 'Counted live from your members, invites and employees.'} />
      <div className="space-y-4">
        {rows.map((r) => {
          const pct = r.limit ? Math.min(100, (r.used / r.limit) * 100) : 0
          const atLimit = r.limit != null && r.used >= r.limit
          return (
            <div key={r.key}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-white">{r.label}</span>
                <span className={cn('font-semibold tabular-nums', !r.ok ? 'text-[#FF6A66]' : atLimit ? 'text-warning' : 'text-white')}>
                  {r.used}
                  {r.limit != null ? ` / ${r.limit}` : ''}
                  {r.limit != null && atLimit ? (r.ok ? ' · at limit' : ' · over limit') : ''}
                </span>
              </div>
              {r.limit != null ? (
                <Progress value={pct} tone={atLimit ? (r.ok ? 'warning' : 'danger') : undefined} />
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export type InvoiceRow = { id: string; number: string; issueDate: string; periodStart: string; periodEnd: string; totalPaise: number; provider: string; paymentId?: string | null; utr?: string | null; status: string; kind: string }

const paymentLabel = (r: InvoiceRow) =>
  r.provider === 'razorpay' ? `Razorpay ${r.paymentId ? `…${r.paymentId.slice(-6)}` : ''}` : r.provider === 'offline' ? `Bank transfer${r.utr ? ` · UTR ${r.utr}` : ''}` : r.provider === 'manual' ? 'Set by Flowbit' : 'Test'

/** Flowbit's GST invoices for this workspace, newest first. */
export function BillingHistory({ rows, total, page, pageSize, params }: { rows: InvoiceRow[]; total: number; page: number; pageSize: number; params: Record<string, string | string[] | undefined> }) {
  return (
    <TableCard icon={<History strokeWidth={1.5} />} label="Invoices and receipts" description={`Invoices issued by ${COMPANY_LEGAL_NAME} when each payment arrives.`}>
      {rows.length ? (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={tableHead}>
                <th scope="col" className={th}>Number</th>
                <th scope="col" className={th}>Date</th>
                <th scope="col" className={cn(th, 'hidden md:table-cell')}>Period</th>
                <th scope="col" className={cn(th, 'text-right')}>Amount</th>
                <th scope="col" className={cn(th, 'hidden sm:table-cell')}>Payment</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}><span className="sr-only">Download</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={tableRow}>
                  <td className={cn(td, 'whitespace-nowrap text-white')}>
                    {r.number}
                    {r.kind === 'upgrade' ? <span className="ml-2 text-xs text-violet">Upgrade</span> : null}
                  </td>
                  <td className={cn(td, 'whitespace-nowrap text-[#979797]')}>{formatDate(r.issueDate)}</td>
                  <td className={cn(td, 'hidden whitespace-nowrap text-[#979797] md:table-cell')}>
                    {formatDate(r.periodStart, { short: true })} – {formatDate(r.periodEnd)}
                  </td>
                  <td className={cn(td, 'whitespace-nowrap text-right tabular-nums text-white')}>{formatINR(r.totalPaise, { decimals: 2 })}</td>
                  <td className={cn(td, 'hidden text-[#979797] sm:table-cell')}>{paymentLabel(r)}</td>
                  <td className={td}>
                    <StatusWord status={r.status === 'cancelled' ? 'cancelled' : 'paid'} label={r.status === 'cancelled' ? 'Cancelled' : 'Paid'} />
                  </td>
                  <td className={td}>
                    <span className="flex justify-end gap-1">
                      <a href={`/api/subscription/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm')}>
                        <Download className="size-3.5" strokeWidth={1.5} /> PDF
                      </a>
                      <EmailInvoiceButton id={r.id} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-line">
          <EmptyState compact icon={<CreditCard />} title="No invoices yet" description="Your first one appears here as soon as you choose a plan." />
        </div>
      )}
      <div className="px-[23px] pb-3">
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/app/settings/subscription" params={{ ...params, tab: 'bills' }} />
      </div>
    </TableCard>
  )
}

/** For members without billing.manage (and locked workspaces). */
export function NoBillingAccess({ workspace, ownerName, ownerEmail, blocked }: { workspace: string; ownerName: string; ownerEmail: string; blocked: boolean }) {
  return (
    <Card variant="solid" className="mx-auto max-w-lg">
      <EmptyState
        icon={blocked ? <Lock /> : <Clock />}
        title={blocked ? `${workspace} is locked until a plan is chosen` : 'Only the workspace owner manages the subscription'}
        description={blocked ? `Your data is safe. Ask ${ownerName} (${ownerEmail}) to choose a plan.` : `Ask ${ownerName} (${ownerEmail}) about plans, seats and invoices.`}
        action={
          blocked ? (
            <form action="/api/auth/signout" method="post">
              <button type="submit" className={buttonClass('secondary')}>Sign out</button>
            </form>
          ) : (
            <Link href="/app" className={buttonClass('primary')}>Back to Home</Link>
          )
        }
      />
    </Card>
  )
}
