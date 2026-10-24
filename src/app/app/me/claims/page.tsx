import type { Metadata } from 'next'
import { ArrowRight, ClipboardList, Paperclip, Receipt } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { dynamicKey, localeOfUser, translator } from '@/lib/i18n'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { FiguresCard } from '@/components/muster/ui/figures'
import { ListCard, TABLE } from '@/components/muster/ui/list-card'
import { NotLinked } from '@/components/muster/me/not-linked'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { APPROVED, CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES, UNDECIDED, type ClaimStatus } from '@/modules/muster/claims/constants'
import { FORM_STATE_LABEL, claimFormState, companyDay, isEligibleFor } from '@/modules/muster/claims/rules'
import { myEmployee } from '@/modules/muster/me/queries'
import { isOnPayroll } from '@/modules/muster/people/lifecycle'

export const metadata: Metadata = { title: 'My claims' }
const BASE = '/app/me/claims'

export default async function MyClaimsPage() {
  const ctx = await requireMember({ product: 'muster' })
  const locale = localeOfUser(ctx.user)
  const t = translator(locale)
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={locale} />
  const [claims, forms] = await Promise.all([
    ctx.db(Claim).find({ employeeId: employee._id }).sort({ createdAt: -1 }).limit(100).lean(),
    ctx.db(ClaimForm).find({ status: 'open', closesAt: { $gte: new Date() } }).sort({ closesAt: 1 }).lean(),
  ])
  const categories = new Map((await ctx.db(ClaimCategory).find({ _id: { $in: claims.map((c) => c.categoryId) } }, { name: 1 }).lean()).map((c) => [String(c._id), c.name]))
  const mine = isOnPayroll(employee.status) ? forms.filter((f) => isEligibleFor(f, String(employee._id))) : []
  const sum = (statuses: readonly ClaimStatus[], approved: boolean) => claims.filter((c) => statuses.includes(c.status as ClaimStatus)).reduce((s, c) => s + (approved ? (c.amountApproved ?? c.amountClaimed) : c.amountClaimed), 0)

  return (
    <>
      <PageHeader title={t('claims.title')} help="claims-vs-expenses" description={t('claims.description')} breadcrumb={breadcrumbFor(BASE)} />
      <FiguresCard
        className="mb-3"
        items={[
          { label: t('claims.awaiting'), value: formatINR(sum(UNDECIDED, false), { decimals: 0 }) },
          { label: t('claims.approved'), value: formatINR(sum([...APPROVED, 'scheduled_for_payroll'], true), { decimals: 0 }), hint: t('claims.approvedHint') },
          { label: t('claims.paid'), value: formatINR(sum(['paid'], true), { decimals: 0 }) },
        ]}
      />
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 self-start rounded-[14px] lg:col-span-4">
          <CardHeader label={t('claims.formsOpen')} icon={<ClipboardList />} />
          {mine.length ? (
            <ul>
              {mine.map((f) => {
                const state = claimFormState(f)
                return (
                  <li key={String(f._id)} className="border-b border-white/[0.1] py-3 last:border-0">
                    <p className="text-sm text-white">{f.name}</p>
                    <p className="text-xs text-fg-2">{state === 'open' ? t('claims.until', { date: formatDate(companyDay(f.closesAt)) }) : t('claims.opens', { state: dynamicKey('claims.form.', state, FORM_STATE_LABEL[state], locale), date: formatDate(companyDay(f.opensAt)) })}</p>
                    {state === 'open' ? (
                      <a href={`/c/${f.slugLower}`} target="_blank" rel="noreferrer" className={`${buttonClass('primary', 'sm')} mt-2`}>
                        {t('claims.file')} <ArrowRight className="size-3.5" />
                      </a>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-fg-2">{t('claims.noForm')}</p>
          )}
        </Card>
        <ListCard className="col-span-12 lg:col-span-8" label={t('claims.title')} icon={<Receipt />} description={t('claims.count', { n: claims.length })}>
          {claims.length ? (
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead>
                  <tr className={TABLE.headRow}>
                    <th className={cn(TABLE.th, 'px-5')}>{t('claims.date')}</th>
                    <th className={cn(TABLE.th, 'px-5')}>{t('claims.expense')}</th>
                    <th className={cn(TABLE.th, 'px-5 text-right')}>{t('claims.claimed')}</th>
                    <th className={cn(TABLE.th, 'px-5 text-right')}>{t('claims.approvedCol')}</th>
                    <th className={cn(TABLE.th, 'px-5')}>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={String(c._id)} className={cn(TABLE.row, 'align-top')}>
                      <td className="whitespace-nowrap px-5 py-3 text-[#979797]">{formatDate(c.expenseDate)}</td>
                      <td className="px-5 py-3">
                        <p className="text-white">{c.purpose}</p>
                        <p className="text-xs text-fg-2">{categories.get(String(c.categoryId)) ?? '—'}{c.vendor ? ` · ${c.vendor}` : ''}</p>
                        {c.attachments?.length ? <a className="inline-flex items-center gap-1 text-xs text-link underline-offset-2 hover:underline" href={`/api/muster/claims/${c._id}/receipt`} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> {t('claims.receipt')}</a> : null}
                        {c.reviewNote ? <p className="mt-1 text-xs italic text-fg-2">“{c.reviewNote}”</p> : null}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-white">{formatINR(c.amountClaimed)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-[#979797]">{c.amountApproved == null ? '—' : formatINR(c.amountApproved)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={CLAIM_STATUS_TONES[c.status as ClaimStatus]}>{dynamicKey('claims.status.', c.status, CLAIM_STATUS_LABELS[c.status as ClaimStatus] ?? c.status, locale)}</Badge>
                        {c.paidAt ? <p className="mt-1 text-xs text-fg-2">{t('claims.paidOn', { date: formatDate(c.paidAt) })}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={<Receipt />} title={t('claims.emptyTitle')} description={t('claims.emptyBody')} />
          )}
        </ListCard>
      </div>
    </>
  )
}
