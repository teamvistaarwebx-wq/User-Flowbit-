import type { Metadata } from 'next'
import { Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { SetupCallout } from '@/components/folio/SetupCallout'
import { ExpenseForm } from '@/components/folio/expenses/ExpenseForm'
import { emptyExpense } from '@/components/folio/expenses/expense-values'
import { expenseFormOptions } from '@/modules/folio/expenses/queries'

export const metadata: Metadata = { title: 'Book expense' }

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'expenses.write' })
  const options = await expenseFormOptions(ctx)
  const firm = first(sp.firm)?.toUpperCase()
  const entityId = options.entities.find((e) => e.code === firm)?.id
  return (
    <>
      <PageHeader title="Book expense" description="Money paid out by one of your firms: rent, software, travel, vendors." back={{ href: '/app/folio/expenses', label: 'Expenses' }} icon={<Wallet />} />
      {options.entities.length ? <ExpenseForm options={options} values={emptyExpense(options, entityId)} cancelHref="/app/folio/expenses" /> : <SetupCallout canSetUp={ctx.can('folio.settings')} />}
    </>
  )
}
