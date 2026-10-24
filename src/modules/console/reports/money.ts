/**
 * Console reports → Money (console spec 7.2, 11): pure maths over Flowbit's
 * own invoices and wallet ledger (./query loads them, Internal and Test
 * workspaces already left out). All amounts are integer paise, ex-GST
 * unless the name says otherwise.
 *
 * MRR movements come from paid plan invoices: a workspace's MRR on a day is
 * the taxable value of the plan invoice whose period covers that day (a
 * yearly invoice divided by 12), with the 7-day payment grace after the
 * period so a late renewal is not counted as churn and new again. Upgrades
 * (proration invoices) count from the next renewal invoice.
 */

const DAY_MS = 86_400_000
const GRACE_DAYS = 7

export type MoneyInvoice = Readonly<{
  orgId: string
  kind: 'subscription' | 'upgrade' | 'wallet_recharge'
  status: 'due' | 'paid' | 'cancelled'
  /** 'YYYY-MM-DD' IST, inclusive. */
  periodStart: string
  periodEnd: string
  cycle: 'monthly' | 'yearly' | null
  taxableValuePaise: number
  totalPaise: number
  receivedPaise: number
  /** When the money arrived (payment.paidAt), else the issue date. */
  paidOn: string
  dueDate: string | null
  isTest: boolean
  tds: Readonly<{ declared: boolean; amountPaise: number; certificateStatus: string | null }> | null
}>

const addDays = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)

/** Real money only: paid, not a simulated payment. */
const isRealPaid = (i: MoneyInvoice) => i.status === 'paid' && !i.isTest

/** MRR of one plan invoice (yearly ÷ 12). */
export const monthlyValue = (i: Pick<MoneyInvoice, 'taxableValuePaise' | 'cycle'>) => (i.cycle === 'yearly' ? Math.round(i.taxableValuePaise / 12) : i.taxableValuePaise)

/** MRR per workspace on `day` ('YYYY-MM-DD'): the latest plan invoice covering it (grace included). */
export function mrrOn(invoices: readonly MoneyInvoice[], day: string): Map<string, number> {
  const out = new Map<string, { start: string; value: number }>()
  for (const i of invoices) {
    if (!isRealPaid(i) || i.kind !== 'subscription') continue
    if (day < i.periodStart || day > addDays(i.periodEnd, GRACE_DAYS)) continue
    const prev = out.get(i.orgId)
    if (!prev || i.periodStart > prev.start) out.set(i.orgId, { start: i.periodStart, value: monthlyValue(i) })
  }
  return new Map([...out].map(([org, v]) => [org, v.value]))
}

export type MrrMovement = Readonly<{
  startPaise: number
  endPaise: number
  newPaise: number
  expansionPaise: number
  contractionPaise: number
  churnedPaise: number
  /** Workspaces behind each movement. */
  counts: { new: number; expansion: number; contraction: number; churned: number }
}>

/** MRR at the start and end of a month ('YYYY-MM'; the end is `asOf` for the running month) and what moved it. */
export function mrrMovement(invoices: readonly MoneyInvoice[], month: string, asOf: string): MrrMovement {
  const first = `${month}-01`
  const lastOfMonth = addDays(`${nextMonth(month)}-01`, -1)
  const last = asOf < lastOfMonth ? asOf : lastOfMonth
  const before = mrrOn(invoices, addDays(first, -1))
  const after = mrrOn(invoices, last)
  const orgs = new Set([...before.keys(), ...after.keys()])
  const acc = { newPaise: 0, expansionPaise: 0, contractionPaise: 0, churnedPaise: 0, counts: { new: 0, expansion: 0, contraction: 0, churned: 0 } }
  for (const org of orgs) {
    const s = before.get(org) ?? 0
    const e = after.get(org) ?? 0
    if (!s && e) {
      acc.newPaise += e
      acc.counts.new += 1
    } else if (s && !e) {
      acc.churnedPaise += s
      acc.counts.churned += 1
    } else if (e > s) {
      acc.expansionPaise += e - s
      acc.counts.expansion += 1
    } else if (e < s) {
      acc.contractionPaise += s - e
      acc.counts.contraction += 1
    }
  }
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
  return { startPaise: sum(before), endPaise: sum(after), ...acc }
}

/** 'YYYY-MM' of the month after. */
export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** The `count` months ending with `last`, oldest first. */
export function monthsEnding(last: string, count: number): string[] {
  const [y, m] = last.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const total = y * 12 + (m - 1) - (count - 1 - i)
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
  })
}

export type CollectionMonth = Readonly<{ month: string; planPaise: number; walletPaise: number; totalPaise: number }>

/** Money received per month (GST included), plans and wallet recharges apart. Test payments are left out. */
export function collectionsByMonth(invoices: readonly MoneyInvoice[], months: readonly string[]): CollectionMonth[] {
  return months.map((month) => {
    const paid = invoices.filter((i) => isRealPaid(i) && i.paidOn.startsWith(month))
    const received = (i: MoneyInvoice) => i.receivedPaise || i.totalPaise
    const planPaise = paid.filter((i) => i.kind !== 'wallet_recharge').reduce((s, i) => s + received(i), 0)
    const walletPaise = paid.filter((i) => i.kind === 'wallet_recharge').reduce((s, i) => s + received(i), 0)
    return { month, planPaise, walletPaise, totalPaise: planPaise + walletPaise }
  })
}

/** TDS deducted by customers whose certificate has not been matched yet (awaited or mismatch). */
export function tdsPending(invoices: readonly MoneyInvoice[]): { count: number; paise: number } {
  const open = invoices.filter((i) => isRealPaid(i) && i.tds?.declared && i.tds.amountPaise > 0 && i.tds.certificateStatus !== 'matched_26as' && i.tds.certificateStatus !== 'received')
  return { count: open.length, paise: open.reduce((s, i) => s + (i.tds?.amountPaise ?? 0), 0) }
}

/** Due bills past their due date: what is still to pay on them (GST included). */
export function overdueBills(invoices: readonly MoneyInvoice[], today: string): { count: number; paise: number } {
  const late = invoices.filter((i) => i.status === 'due' && i.dueDate && i.dueDate < today)
  const balance = (i: MoneyInvoice) => Math.max(0, i.totalPaise - (i.tds?.declared ? i.tds.amountPaise : 0) - i.receivedPaise)
  return { count: late.length, paise: late.reduce((s, i) => s + balance(i), 0) }
}

export type RenewalAccount = Readonly<{ id: string; name: string; periodEnd: Date | null; amountPaise: number; cycle: string | null; autopay: boolean; cancelAtPeriodEnd: boolean; paid: boolean }>

/** Paid plans that renew within `days`: autopay ones collect themselves, the rest need a bill. */
export function renewalsDue(accounts: readonly RenewalAccount[], now: Date, days = 30): { rows: RenewalAccount[]; paise: number } {
  const until = now.getTime() + days * DAY_MS
  const rows = accounts
    .filter((a) => a.paid && !a.cancelAtPeriodEnd && a.periodEnd && a.periodEnd.getTime() >= now.getTime() && a.periodEnd.getTime() <= until)
    .sort((a, b) => a.periodEnd!.getTime() - b.periodEnd!.getTime())
  return { rows, paise: rows.reduce((s, a) => s + a.amountPaise, 0) }
}

// ---------------------------------------------------------------------------
// The WhatsApp wallet: recharges and the margin on messages
// ---------------------------------------------------------------------------

export type LedgerEntry = Readonly<{ orgId: string; type: string; at: Date; amountPaise: number; paidPaise: number; category: string | null }>

export type WalletMonth = Readonly<{ month: string; rechargePaise: number; revenuePaise: number; costPaise: number; marginPaise: number; messages: number }>

/**
 * Per month (IST): wallet recharges (credit bought, ex-GST) and the margin
 * on messages. Revenue is what messages took from paid credit, less refunds
 * of it; free allowance and promo credit earn nothing. Cost is what the
 * provider bills Flowbit: only for workspaces in Flowbit-managed mode (in
 * "bring your own" mode Interakt bills the workspace), at the Console rate
 * card (paise per message by category).
 */
export function walletMonths(entries: readonly LedgerEntry[], months: readonly string[], managedOrgs: ReadonlySet<string>, costPerMessage: Readonly<Record<string, number>>): WalletMonth[] {
  const monthOf = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 7)
  return months.map((month) => {
    const rows = entries.filter((e) => monthOf(e.at) === month)
    const rechargePaise = rows.filter((e) => e.type === 'recharge').reduce((s, e) => s + e.amountPaise, 0)
    const debits = rows.filter((e) => e.type === 'debit')
    const refunds = rows.filter((e) => e.type === 'refund')
    const revenuePaise = debits.reduce((s, e) => s + e.paidPaise, 0) - refunds.reduce((s, e) => s + e.paidPaise, 0)
    const sent = [...debits, ...rows.filter((e) => e.type === 'free')].filter((e) => managedOrgs.has(e.orgId))
    // Rates keep fractional paise (₹0.128 = 12.8 paise); the month's cost is rounded once.
    const costPaise = Math.round(sent.reduce((s, e) => s + (costPerMessage[e.category ?? 'utility'] ?? costPerMessage.utility ?? 0), 0))
    return { month, rechargePaise, revenuePaise, costPaise, marginPaise: revenuePaise - costPaise, messages: debits.length }
  })
}
