import type { Metadata } from 'next'
import { Download, Wallet } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { fiscalYear, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { NotLinked } from '@/components/muster/me/not-linked'
import { Callout } from '@/components/muster/payroll/callout'
import { FiguresCard } from '@/components/muster/ui/figures'
import { ListCard, TABLE } from '@/components/muster/ui/list-card'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { myEmployee } from '@/modules/muster/me/queries'
import { cycleLabel, cycleMonth } from '@/modules/muster/payroll/queries'
import { STAGE_LABELS, isAtLeast, payslipOwner } from '@/modules/muster/payroll/stages'
import { localeOfUser, translator } from '@/lib/i18n'

export const metadata: Metadata = { title: 'My payslips' }
const BASE = '/app/me/payslips'

export default async function MyPayslipsPage() {
  const ctx = await requireMember({ product: 'muster', feature: 'muster.payroll' })
  const locale = localeOfUser(ctx.user)
  const t = translator(locale)
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={locale} />
  const entries = await ctx.db(PayrollEntry).find({ employeeId: employee._id, status: { $ne: 'excluded' } }, { snapshot: 0 }).lean()
  const [cycles, slips] = await Promise.all([
    ctx.db(PayrollCycle).find({ _id: { $in: entries.map((e) => e.cycleId) } }, { year: 1, month: 1, status: 1, paymentDate: 1 }).lean(),
    ctx.db(Payslip).find({ employeeId: employee._id, isPublished: true }, { entryId: 1, payslipNumber: 1 }).lean(),
  ])
  const cycleOf = new Map(cycles.map((c) => [String(c._id), c]))
  const published = new Map(slips.map((s) => [String(s.entryId), s]))
  const rows = entries
    .flatMap((e) => {
      const c = cycleOf.get(String(e.cycleId))
      return c && isAtLeast(c.status, 'generated') ? [{ e, c }] : []
    })
    .sort((a, b) => cycleMonth(b.c).localeCompare(cycleMonth(a.c)))
  const fy = fiscalYear(todayIST())
  const thisYear = rows.filter((r) => fiscalYear(`${cycleMonth(r.c)}-01`) === fy && isAtLeast(r.c.status, 'released') && r.e.status === 'ready')
  const latest = rows[0]

  return (
    <>
      <PageHeader title={t('pay.title')} description={t('pay.description')} breadcrumb={breadcrumbFor(BASE)} />
      {latest && !isAtLeast(latest.c.status, 'released') ? (
        <Callout className="mb-3" tone="info" title={t('pay.stillWith', { month: cycleLabel(latest.c), who: payslipOwner(latest.c.status) === 'finance' ? t('pay.finance') : t('pay.hr') })}>
          {t('pay.canChange')}
        </Callout>
      ) : null}
      <FiguresCard
        className="mb-3"
        items={[
          { label: t('pay.latest'), value: latest ? cycleLabel(latest.c) : '—', hint: latest ? t('pay.net', { amount: formatINR(latest.e.netPay) }) : undefined },
          { label: t('common.status'), value: latest ? STAGE_LABELS[latest.c.status] : '—', tone: latest?.e.status === 'on_hold' ? 'warning' : undefined, hint: latest?.e.status === 'on_hold' ? t('pay.onHoldHint') : undefined },
          { label: t('pay.netFy', { fy }), value: formatINR(thisYear.reduce((s, r) => s + r.e.netPay, 0), { decimals: 0 }) },
          { label: t('pay.deductedFy', { fy }), value: formatINR(thisYear.reduce((s, r) => s + r.e.totalDeductions, 0), { decimals: 0 }) },
        ]}
      />
      <ListCard label={t('pay.list')} icon={<Wallet />} description={t('pay.listDescription')}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={TABLE.table}>
              <thead>
                <tr className={TABLE.headRow}>
                  <th className={cn(TABLE.th, 'px-5')}>{t('pay.month')}</th>
                  <th className={cn(TABLE.th, 'px-5')}>{t('pay.daysPaid')}</th>
                  <th className={cn(TABLE.th, 'px-5 text-right')}>{t('pay.earned')}</th>
                  <th className={cn(TABLE.th, 'hidden px-5 text-right md:table-cell')}>{t('pay.deductions')}</th>
                  <th className={cn(TABLE.th, 'hidden px-5 text-right md:table-cell')}>{t('pay.claims')}</th>
                  <th className={cn(TABLE.th, 'px-5 text-right')}>{t('pay.netPay')}</th>
                  <th className={cn(TABLE.th, 'px-5')}>{t('common.status')}</th>
                  <th className={cn(TABLE.th, 'px-5')} />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, c }) => {
                  const slip = published.get(String(e._id))
                  return (
                    <tr key={String(e._id)} className={TABLE.row}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-white">{cycleLabel(c)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 tabular-nums"><span className="text-white">{e.payableDays}</span><span className="text-[#979797]"> {t('pay.of', { n: e.workingDays })}</span>{e.lopDays ? <span className="ml-1 text-xs text-[#FF6A66]">({e.lopDays} LOP)</span> : null}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-white">{formatINR(e.totalEarnings)}</td>
                      <td className="hidden px-5 py-2.5 text-right tabular-nums text-[#979797] md:table-cell">{formatINR(e.totalDeductions)}</td>
                      <td className="hidden px-5 py-2.5 text-right tabular-nums text-[#979797] md:table-cell">{e.reimbursementAmount ? formatINR(e.reimbursementAmount) : '—'}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-white">{formatINR(e.netPay)}</td>
                      <td className="px-5 py-2.5">{e.status === 'on_hold' ? <Badge tone="warning">{t('pay.onHold')}</Badge> : <Badge tone={isAtLeast(c.status, 'released') ? 'success' : 'info'}>{isAtLeast(c.status, 'released') ? t('common.paid') : STAGE_LABELS[c.status]}</Badge>}</td>
                      <td className="px-5 py-2.5 text-right">
                        {slip ? (
                          <a href={`/api/muster/payslips/${e._id}?download=1${locale === 'hi' ? '&lang=hi' : ''}`} className={buttonClass('secondary', 'sm')}>
                            <Download className="size-3.5" /> PDF
                          </a>
                        ) : (
                          <span className="text-xs text-fg-2">{t('pay.notPublished')}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Wallet />} title={t('pay.none')} description={t('pay.noneHint')} />
        )}
      </ListCard>
    </>
  )
}
