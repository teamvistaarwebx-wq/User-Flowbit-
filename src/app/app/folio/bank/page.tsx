import type { Metadata } from 'next'
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, History } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { TableCard } from '@/components/folio/ui'
import { StatementImport, type FirmOption } from '@/components/folio/bank/statement-import'
import { CreditQueue, DebitQueue, ResolvedList, StatementList } from '@/components/folio/bank/reconcile-queue'
import { FolioEntity } from '@/models/folio/Entity'
import { entityLabel } from '@/modules/folio/context'
import { bankQueue } from '@/modules/folio/bank/queue'
import { firmContext } from '@/modules/folio/queries/common'

export const metadata: Metadata = { title: 'Bank reconciliation' }

/**
 * Folio → Bank: import a statement, confirm the suggested invoice for each
 * deposit (a receipt through the usual receipt code), book withdrawals as
 * expenses, and undo a statement within 7 days.
 */
export default async function BankPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'receipts.write' })
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  const [entities, queue] = await Promise.all([
    ctx.db(FolioEntity).find({ isActive: true }, { legalName: 1, tradeName: 1, bankAccounts: 1 }).sort({ isDefault: -1, code: 1 }).lean(),
    bankQueue(ctx, firm?.id ?? null),
  ])
  const options: FirmOption[] = entities.map((e) => ({ id: String(e._id), name: entityLabel(e), accounts: (e.bankAccounts ?? []).map((b) => ({ id: String(b._id), label: `${b.label} · ••${b.accountNumber.slice(-4)}` })) }))
  const ordered = firm ? [...options.filter((o) => o.id === firm.id), ...options.filter((o) => o.id !== firm.id)] : options
  return (
    <>
      <PageHeader
        title="Bank reconciliation"
        description="Import a statement, confirm which invoice each deposit pays, and book the rest as expenses."
        breadcrumb={breadcrumbFor('/app/folio/bank')}
        actions={<FirmSwitch base="/app/folio/bank" params={sp} firms={firms} firm={firm} />}
      />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-7">
          <StatementImport firms={ordered} />
        </div>
        <TableCard className="col-span-12 xl:col-span-5" icon={<FileSpreadsheet strokeWidth={1.5} />} title="Statements" subtitle="Undo removes a statement within 7 days">
          <StatementList rows={queue.statements} />
        </TableCard>
        <TableCard className="col-span-12" icon={<ArrowDownLeft strokeWidth={1.5} />} title="Money in to match" subtitle={`${queue.credits.length} deposits waiting. Confirm a suggestion to record the receipt.`}>
          <CreditQueue rows={queue.credits} invoices={queue.invoices} />
        </TableCard>
        <TableCard className="col-span-12 xl:col-span-7" icon={<ArrowUpRight strokeWidth={1.5} />} title="Money out" subtitle={`${queue.debits.length} withdrawals waiting`}>
          <DebitQueue rows={queue.debits} categories={queue.categories} canExpense={ctx.can('expenses.write')} />
        </TableCard>
        <TableCard className="col-span-12 xl:col-span-5" icon={<History strokeWidth={1.5} />} title="Recently decided">
          <ResolvedList rows={queue.resolved} />
        </TableCard>
      </div>
    </>
  )
}
