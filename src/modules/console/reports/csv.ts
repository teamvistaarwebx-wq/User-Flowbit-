import { isoDateIST } from '@/lib/dates'
import { toCsv } from '@/modules/orbit/csv'
import type { BuiltReport, ReportParams, ReportSection } from './build'
import { PERIOD_LABEL } from './build'

/** Console reports as CSV (one file per section; formula-safe cells, rupees with 2 decimals). Pure. */

const rupees = (paise: number) => (paise / 100).toFixed(2)
const pct = (value: number | null) => (value == null ? '' : value.toFixed(1))
const BOM = '﻿'

/** Several tables in one file, a blank line between them, one BOM at the start. */
const tables = (...csvs: string[]) => BOM + csvs.map((c) => c.replace(/^﻿/, '')).join('\r\n')

export function reportCsv(section: ReportSection, report: BuiltReport, params: ReportParams): string | null {
  if (section === 'funnel' && report.funnel) {
    const f = report.funnel
    return tables(
      toCsv([`Funnel (signups in the last ${PERIOD_LABEL[params.period]})`, 'Accounts', '% of previous step', '% of signups'], f.rows.map((r) => [r.label, r.count, pct(r.fromPrevious), pct(r.fromSignup)])),
      toCsv(['Started as', 'Accounts'], [['Free', f.split.free], ['Trial', f.split.trial]]),
      toCsv(['Stalled at', 'Why', 'Accounts'], f.stalls.map((s) => [s.label, s.hint, s.count])),
      toCsv(['Stalled account', 'Workspace id', 'Stalled at', 'Days since signup'], f.stalled.map((s) => [s.name, s.id, s.step, s.days])),
    )
  }
  if (section === 'money' && report.money) {
    const m = report.money
    const v = m.movement
    return tables(
      toCsv(['Measure', 'Rupees (ex-GST unless noted)', 'Accounts'], [
        ['MRR now', rupees(m.mrrPaise), ''],
        ['ARR now', rupees(m.arrPaise), ''],
        [`MRR at the start of ${m.month}`, rupees(v.startPaise), ''],
        [`New MRR in ${m.month}`, rupees(v.newPaise), v.counts.new],
        [`Expansion MRR in ${m.month}`, rupees(v.expansionPaise), v.counts.expansion],
        [`Contraction MRR in ${m.month}`, rupees(v.contractionPaise), v.counts.contraction],
        [`Churned MRR in ${m.month}`, rupees(v.churnedPaise), v.counts.churned],
        [`MRR at the end of ${m.month}`, rupees(v.endPaise), ''],
        ['Renewals due in 30 days', rupees(m.renewals.paise), m.renewals.rows.length],
        ['Overdue bills (incl. GST)', rupees(m.overdueBills.paise), m.overdueBills.count],
        ['Plans past their renewal date', rupees(m.pastDue.paise), m.pastDue.count],
        ['TDS certificates pending', rupees(m.tds.paise), m.tds.count],
      ]),
      toCsv(['Month', 'Plan collections (incl. GST)', 'Wallet recharge collections (incl. GST)', 'Total collected', 'Wallet credit bought (ex-GST)', 'Message revenue', 'Provider cost', 'Message margin', 'Paid messages'], m.collections.map((c, i) => {
        const w = m.wallet[i]
        return [c.month, rupees(c.planPaise), rupees(c.walletPaise), rupees(c.totalPaise), rupees(w.rechargePaise), rupees(w.revenuePaise), rupees(w.costPaise), rupees(w.marginPaise), w.messages]
      })),
      toCsv(['Renews', 'Workspace', 'Workspace id', 'Amount per period (ex-GST)', 'Cycle', 'Autopay'], m.renewals.rows.map((r) => [r.periodEnd ? isoDateIST(r.periodEnd) : '', r.name, r.id, rupees(r.amountPaise), r.cycle ?? '', r.autopay ? 'yes' : 'no'])),
    )
  }
  if (section === 'team' && report.team) {
    return toCsv(['Salesperson', 'Accounts', 'Free', 'Trial', 'Paid', 'Habit formed', `Signups (${PERIOD_LABEL[params.period]})`, 'First payments', 'Conversion %', 'MRR'], report.team.map((t) => [t.name, t.accounts, t.free, t.trial, t.paid, t.habit, t.signups, t.conversions, pct(t.conversionRate), rupees(t.mrrPaise)]))
  }
  if (section === 'marketing' && report.marketing) {
    return toCsv([`UTM ${params.group}`, `Signups (${PERIOD_LABEL[params.period]})`, 'Free', 'Trial', 'Paid', 'Conversion %', 'MRR'], report.marketing.map((r) => [r.key, r.signups, r.free, r.trial, r.paid, pct(r.conversionRate), rupees(r.mrrPaise)]))
  }
  return null
}
