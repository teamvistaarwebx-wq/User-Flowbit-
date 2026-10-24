import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarClock, CalendarRange, ClipboardList, IndianRupee, Inbox, Paperclip, Tags, Users, Wallet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatMonth, todayIST } from '@/lib/dates'
import { parseListParams, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { oid } from '@/lib/serialize'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Facts } from '@/components/muster/ui/facts'
import { FormStatusButton } from '@/components/muster/claims/category-controls'
import { CopyLink } from '@/components/muster/claims/copy-link'
import { EditFormDialog } from '@/components/muster/claims/edit-form-dialog'
import { ReviewQueue } from '@/components/muster/claims/review-queue'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { Employee } from '@/models/muster/Employee'
import { claimTotals, listClaims } from '@/modules/muster/claims/queries'
import { FORM_STATE_LABEL, FORM_STATE_TONE, claimFormState, companyDay, formWindowLabel } from '@/modules/muster/claims/rules'

export const metadata: Metadata = { title: 'Claim form' }

export default async function ClaimFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'muster', perm: 'claims.forms' })
  const form = /^[a-f0-9]{24}$/.test(id) ? await ctx.db(ClaimForm).findById(id).lean() : null
  if (!form) notFound()
  const p = parseListParams(sp, { pageSize: 25 })
  const [categories, eligible, claims, totals] = await Promise.all([
    ctx.db(ClaimCategory).find({ _id: { $in: form.categoryIds } }).sort({ displayOrder: 1 }).lean(),
    form.eligibility === 'selected' ? ctx.db(Employee).find({ _id: { $in: form.eligibleEmployeeIds } }, { fullName: 1, code: 1 }).sort({ fullName: 1 }).lean() : Promise.resolve([]),
    listClaims(ctx, { tab: 'all', formId: oid(id), skip: p.skip, limit: p.pageSize }),
    claimTotals(ctx, { formId: oid(id) }),
  ])
  const state = claimFormState(form)
  const base = `/app/hr/claims/forms/${id}`

  return (
    <>
      <PageHeader
        title={form.name}
        description={form.description ?? 'Claim form'}
        back={{ href: '/app/hr/claims/forms', label: 'Claim forms' }}
        actions={
          <>
            <Badge tone={FORM_STATE_TONE[state]} size="md">{FORM_STATE_LABEL[state]}</Badge>
            <EditFormDialog id={id} name={form.name} description={form.description ?? ''} closesOn={companyDay(form.closesAt)} today={todayIST()} />
            <FormStatusButton id={id} name={form.name} open={form.status === 'open'} size="md" />
          </>
        }
      />
      {/* Project overview's two-column glass card: the form's facts on the left, categories and audience on the right. */}
      <Card className="mb-3 rounded-[14px] lit-edge-bright">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-8">
          <div className="min-w-0">
            <CardHeader label="Form details" icon={<ClipboardList />} actions={<CopyLink slug={form.slugLower} />} />
            <Facts
              items={[
                { icon: <CalendarRange />, label: 'Window', value: formWindowLabel(form) },
                { icon: <CalendarClock />, label: 'Deadline', value: formatDate(companyDay(form.closesAt)) },
                { icon: <Paperclip />, label: 'Receipt', value: form.requiresReceipt ? 'Required' : 'Optional' },
                { icon: <IndianRupee />, label: 'Most per claim', value: form.maxClaimAmount ? formatINR(form.maxClaimAmount) : 'No cap' },
                { icon: <Wallet />, label: 'Paid with', value: form.includeInPayroll && form.payrollYear && form.payrollMonth ? `${formatMonth(`${form.payrollYear}-${String(form.payrollMonth).padStart(2, '0')}`)} salary` : 'Paid separately' },
                { icon: <Inbox />, label: 'Claims so far', value: `${totals.pending.count + totals.approved.count + totals.paid.count + totals.rejected.count} · ${formatINR(totals.pending.amount + totals.approved.amount + totals.paid.amount, { decimals: 0 })}` },
              ]}
            />
          </div>
          <span aria-hidden className="hidden bg-[#6B676C] lg:block" />
          <div className="min-w-0 border-t border-white/[0.12] pt-5 lg:border-0 lg:pt-0">
            <CardHeader label="Categories" icon={<Tags />} />
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Badge key={String(c._id)} tone={c.isActive ? 'violet' : 'neutral'} size="md">
                  {c.name}
                  {c.maxAmount ? ` · up to ${formatINR(c.maxAmount, { decimals: 0 })}` : ''}
                </Badge>
              ))}
            </div>
            <CardHeader className="mt-6" label="Who can use it" icon={<Users />} />
            {form.eligibility === 'all' ? (
              <p className="text-sm text-white/80">Everyone on payroll with a work email.</p>
            ) : (
              <ul className="scroll-fade-y max-h-40 space-y-1 overflow-y-auto text-sm text-white/85">
                {eligible.map((e) => (
                  <li key={String(e._id)}>
                    {e.fullName} <span className="text-fg-2">({e.code})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
      <ReviewQueue label="Claims on this form" icon={<Inbox />} description={`${claims.total} ${claims.total === 1 ? 'claim' : 'claims'}`} rows={claims.rows} tab="form" canReview={false} canPay={false} canSchedule={false} cycles={[]} empty={<EmptyState compact icon={<Inbox />} title="No claims on this form yet" description="Share the link above. Claims appear here as people file them." />} />
      <Pagination page={p.page} pageSize={p.pageSize} total={claims.total} basePath={base} params={sp} className="mt-4" />
    </>
  )
}
