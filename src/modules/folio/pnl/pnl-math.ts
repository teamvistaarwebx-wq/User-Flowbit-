/**
 * Management profit and loss (pure). Income is the taxable value of issued
 * invoices less credit notes (GST is not income); costs are expenses net of
 * claimable input tax, plus salaries from released Muster payroll when they
 * are included. Not statutory accounts: no accruals, depreciation or tax.
 */

export type MonthAmount = { month: string; paise: number }

export type PnlInput = {
  months: string[]
  income: MonthAmount[]
  credits: MonthAmount[]
  expenses: (MonthAmount & { categoryId: string })[]
  categories: { id: string; name: string }[]
  /** Null when salaries are not part of this view (Muster off, no access, or one firm). */
  payroll: MonthAmount[] | null
}

export type PnlRowKind = 'income' | 'credit' | 'net_income' | 'expense' | 'salaries' | 'total_costs' | 'net'
export type PnlRow = { key: string; label: string; kind: PnlRowKind; values: number[]; total: number }

export type Pnl = {
  months: string[]
  rows: PnlRow[]
  incomePaise: number
  costsPaise: number
  netPaise: number
  /** Net profit as a share of net income, one decimal; null when there is no income. */
  marginPercent: number | null
  chart: { month: string; incomePaise: number; costsPaise: number; netPaise: number }[]
}

const perMonth = (months: string[], rows: readonly MonthAmount[]): number[] => months.map((m) => rows.reduce((s, r) => (r.month === m ? s + r.paise : s), 0))
const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0)
const row = (key: string, label: string, kind: PnlRowKind, values: number[]): PnlRow => ({ key, label, kind, values, total: sum(values) })
const add = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v + (b[i] ?? 0))

export function buildPnl(input: PnlInput): Pnl {
  const { months } = input
  const income = perMonth(months, input.income)
  const credits = perMonth(months, input.credits).map((v) => (v ? -v : 0))
  const netIncome = add(income, credits)
  const names = new Map(input.categories.map((c) => [c.id, c.name]))
  const categoryIds = [...new Set(input.expenses.map((e) => e.categoryId))]
  const expenseRows = categoryIds
    .map((id) => row(`category:${id}`, names.get(id) ?? 'Uncategorised', 'expense', perMonth(months, input.expenses.filter((e) => e.categoryId === id))))
    .filter((r) => r.values.some((v) => v !== 0))
    .sort((a, b) => b.total - a.total)
  const salaries = input.payroll ? row('salaries', 'Salaries (Muster payroll)', 'salaries', perMonth(months, input.payroll)) : null
  const costs = [...expenseRows, ...(salaries ? [salaries] : [])].reduce((acc, r) => add(acc, r.values), months.map(() => 0))
  const net = netIncome.map((v, i) => v - costs[i])
  const incomePaise = sum(netIncome)
  const netPaise = sum(net)
  return {
    months,
    rows: [
      row('income', 'Invoiced (taxable value)', 'income', income),
      row('credits', 'Less credit notes', 'credit', credits),
      row('net_income', 'Net income', 'net_income', netIncome),
      ...expenseRows,
      ...(salaries ? [salaries] : []),
      row('total_costs', 'Total costs', 'total_costs', costs),
      row('net', 'Net profit', 'net', net),
    ],
    incomePaise,
    costsPaise: sum(costs),
    netPaise,
    marginPercent: incomePaise > 0 ? Math.round((netPaise / incomePaise) * 1000) / 10 : null,
    chart: months.map((month, i) => ({ month, incomePaise: netIncome[i], costsPaise: costs[i], netPaise: net[i] })),
  }
}
