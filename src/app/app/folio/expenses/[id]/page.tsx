import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText, Pencil, Repeat, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatDateTime, formatMonth, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/ui/page-header'
import { ExpenseActions } from '@/components/folio/expenses/ExpenseActions'
import { ExpenseForm } from '@/components/folio/expenses/ExpenseForm'
import { expenseValues } from '@/components/folio/expenses/expense-values'
import { Fact, Figure, INSET, LINK, OverviewCard, PanelHeader, SolidCard } from '@/components/folio/ui'
import { expenseDetail, expenseFormOptions } from '@/modules/folio/expenses/queries'
import { EXPENSE_MODE_LABELS, PAID_FROM_LABELS, nextMonthSameDay, repeatDayOf, type ExpenseMode, type PaidFrom } from '@/modules/folio/expenses/rules'

export const metadata: Metadata = { title: 'Expense' }

const BASE = '/app/folio/expenses'

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'folio', perm: 'expenses.read' })
  const e = await expenseDetail(ctx, id)
  if (!e) notFound()
  const canWrite = ctx.can('expenses.write')
  const back = { href: BASE, label: 'Expenses' }

  if (canWrite && first(sp.edit) === '1') {
    const options = await expenseFormOptions(ctx, { entityId: e.entityId, categoryId: e.categoryId })
    return (
      <>
        <PageHeader title={`Edit ${e.vendor}`} description={`${formatINR(e.amountPaise)} · ${formatDate(e.date)}`} back={{ href: `${BASE}/${e.id}`, label: 'Expense' }} icon={<Pencil />} />
        <ExpenseForm options={options} values={expenseValues(e)} cancelHref={`${BASE}/${e.id}`} />
      </>
    )
  }

  const next = nextMonthSameDay(e.date, repeatDayOf(e))
  // A copy is booked as paid, so next month's copy waits until that month starts.
  const canCopy = !e.copiedToId && next.slice(0, 7) <= todayIST().slice(0, 7)
  return (
    <>
      <PageHeader
        title={e.vendor}
        description={`${formatINR(e.amountPaise)} paid on ${formatDate(e.date, { withWeekday: true })} by ${e.entityName}`}
        back={back}
        icon={<Wallet />}
        actions={
          canWrite ? (
            <>
              <ExpenseActions id={e.id} vendor={e.vendor} nextMonthLabel={formatMonth(next.slice(0, 7))} canCopy={canCopy} />
              <Button variant="primary" icon={<Pencil className="size-4" />} href={`${BASE}/${e.id}?edit=1`}>Edit</Button>
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-12 gap-4">
        <OverviewCard className="col-span-12 lg:col-span-8">
          <PanelHeader icon={<Wallet />} title="Expense" actions={<Badge tone="neutral">{e.categoryName}</Badge>} />
          <div className="mt-4 grid grid-cols-2 gap-4 border-b border-line-soft/60 pb-4 sm:max-w-md">
            <Figure label="Amount paid" value={formatINR(e.amountPaise)} valueClassName="text-xl leading-7" />
            <Figure label="Cost in the P&L" value={formatINR(e.netPaise)} valueClassName="text-xl leading-7" />
          </div>
          <div className="mt-2 grid gap-x-10 sm:grid-cols-2">
            <Fact label="Paid to">{e.vendor}</Fact>
            <Fact label="What for">{e.description ?? null}</Fact>
            <Fact label="GST in it">{e.gstPaise ? `${formatINR(e.gstPaise)} · ${e.itcEligible ? 'claimable as input tax' : 'not claimed, counted as cost'}` : 'None'}</Fact>
            {e.vendorGstin ? <Fact label="Vendor GSTIN">{e.vendorGstin}</Fact> : null}
            <Fact label="Firm">{`${e.entityCode} · ${e.entityName}`}</Fact>
            <Fact label="Paid by">{`${EXPENSE_MODE_LABELS[e.mode as ExpenseMode] ?? e.mode} from ${PAID_FROM_LABELS[e.paidFrom as PaidFrom]?.toLowerCase() ?? e.paidFrom}`}</Fact>
            {e.paidFrom === 'bank' ? <Fact label="Account">{e.bankLabel ?? null}</Fact> : null}
            {e.reference ? <Fact label="Reference">{e.reference}</Fact> : null}
          </div>
          {e.notes ? <p className={`mt-4 whitespace-pre-line px-4 py-3 text-[13px] leading-5 text-white/80 ${INSET}`}>{e.notes}</p> : null}
        </OverviewCard>
        <div className="col-span-12 space-y-4 lg:col-span-4">
          <SolidCard>
            <PanelHeader icon={<FileText />} title="Bill" />
            <div className="mt-3">
              {e.receiptFileId ? (
                <a className={buttonClass('secondary', 'sm')} href={`/api/files/${e.receiptFileId}`} target="_blank" rel="noreferrer"><FileText className="size-4" /> Open the bill</a>
              ) : (
                <p className="text-[13px] text-fg-2">No bill attached.{canWrite ? ' Edit the expense to attach one.' : ''}</p>
              )}
            </div>
          </SolidCard>
          <SolidCard>
            <PanelHeader icon={<Repeat />} title="Repeats" />
            <p className="mt-3 text-[13px] leading-5 text-white/80">{e.repeatMonthly ? 'Every month. It is offered for copying into the next month.' : 'One-off.'}</p>
            {e.copiedFromId ? <p className="mt-2 text-xs text-fg-2">Copied from <Link href={`${BASE}/${e.copiedFromId}`} className={LINK}>last month&rsquo;s expense</Link>.</p> : null}
            {e.copiedToId ? <p className="mt-2 text-xs text-fg-2">Already copied to <Link href={`${BASE}/${e.copiedToId}`} className={LINK}>{formatMonth(next.slice(0, 7))}</Link>.</p> : null}
            {e.createdAt ? <p className="mt-3 text-xs text-fg-3">Booked {formatDateTime(e.createdAt)}</p> : null}
          </SolidCard>
        </div>
      </div>
    </>
  )
}
