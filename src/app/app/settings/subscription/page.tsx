import type { Metadata } from 'next'
import { CalendarClock, FlaskConical, Layers } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { companyProfileOf } from '@/lib/company-profile'
import { isBlocked, requireMember } from '@/lib/ctx'
import { formatDate, isoDateIST } from '@/lib/dates'
import { flowbitSupplier } from '@/lib/env'
import { parseListParams, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { parsePlanIntentQuery } from '@/lib/plan-intent'
import type { BillingCycle } from '@/lib/plans'
import { billableSeats } from '@/lib/billing'
import { freeReturnMessage, freeReturnRefusal } from '@/lib/lifecycle'
import { LifecyclePanel } from '@/components/subscription/lifecycle-panel'
import type { Tone } from '@/lib/status'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { InfoTip } from '@/components/ui/info-tip'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { BillingDetailsForm, type BillingDefaults } from '@/components/settings/billing-details-form'
import { PlanPicker } from '@/components/settings/plan-picker'
import { Notice } from '@/components/settings/surface'
import { CancelChangeButton, CancelSubscriptionButton, ChangePlanDialog, SimulateRenewalButton } from '@/components/settings/subscription-buttons'
import { NoBillingAccess, UsageCard } from '@/components/settings/subscription-sections'
import { BillingTabs, BILLS_TAB_HREF } from '@/components/billing/billing-tabs'
import { BillsPanel } from '@/components/billing/bills-panel'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { defaultSelections, selectionLabel, selectionOf } from '@/modules/subscription/selection'
import { pickerQuery, pickerStart } from '@/modules/subscription/page-data'
import { capacityOf } from '@/modules/subscription/usage'
import { paymentMode } from '@/modules/subscription/guards'
import { firstYearDiscountFor } from '@/modules/billing/first-year'
import { kindAllowsProduct, workspaceKindOf } from '@/lib/workspace-kind'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Plan & billing' }
const DAY_MS = 86_400_000

const lastDay = (end: Date | string) => formatDate(isoDateIST(new Date(new Date(end).getTime() - 1)))

/** Plan & billing header, shared by both tabs: title, test-mode flag, plan state, then the tab bar. */
function PlanHeader({ pill, testMode }: { pill: { label: string; tone: Tone }; testMode: boolean }) {
  return (
    <>
      <PageHeader
        title="Plan & billing"
        help="modules-vs-plan"
        description="Your plan and seats, Flowbit's bills and invoices, and autopay."
        breadcrumb={breadcrumbFor('/app/settings/subscription')}
        actions={
          <span className="flex items-center gap-2">
            {testMode ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-warning">
                <FlaskConical className="size-4" strokeWidth={1.5} /> Test mode
              </span>
            ) : null}
            <Badge tone={pill.tone} size="md">{pill.label}</Badge>
            <InfoTip concept="free-vs-trial" />
          </span>
        }
      />
      <BillingTabs />
    </>
  )
}

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ allowBlocked: true })
  if (!ctx.can('billing.manage')) {
    const owner = await ctx.db(Member).findOne({ role: 'owner', status: 'active' }, { userId: 1 }).lean()
    const ownerUser = owner ? await User.findById(owner.userId, { name: 1, email: 1 }).lean() : null
    return <NoBillingAccess workspace={ctx.org.name} ownerName={ownerUser?.name ?? 'the owner'} ownerEmail={ownerUser?.email ?? ''} blocked={isBlocked(ctx)} />
  }

  const org = ctx.org
  const sub = org.subscription
  const ent = ctx.entitlements
  const status = ent.status
  const free = ent.accountType === 'free'
  const p = parseListParams(sp)
  const billsTab = p.get('tab') === 'bills'
  const mode = paymentMode()
  const testMode = mode === 'simulated'
  const paymentsOff = mode === 'off'
  const pill: { label: string; tone: Tone } =
    ent.access === 'blocked' ? { label: 'Locked', tone: 'danger' } : ent.access === 'read_only' ? { label: 'Read-only', tone: 'danger' } : status === 'trialing' ? { label: free ? 'Free' : 'Trial', tone: 'info' } : status === 'active' ? { label: 'Active', tone: 'success' } : status === 'past_due' ? { label: 'Payment due', tone: 'warning' } : status === 'canceled' ? { label: 'Ending', tone: 'info' } : { label: 'Expired', tone: 'danger' }

  const header = <PlanHeader pill={pill} testMode={testMode} />
  if (billsTab) {
    return (
      <>
        {header}
        <BillsPanel ctx={ctx} sp={sp} />
      </>
    )
  }

  const [cap, dueBills] = await Promise.all([capacityOf(ctx), ctx.db(SubscriptionInvoice).countDocuments({ status: 'due' })])
  const { stateCode2: supplierState, gstin: supplierGstin, supportEmail } = flowbitSupplier()
  const billing = sub?.billing
  const billingState = billing?.address?.stateCode ?? null
  const current = selectionOf(sub)
  const isActive = status === 'active' && Boolean(sub?.currentPeriodStart && sub?.currentPeriodEnd)
  const trialLeft = ent.trialDaysLeft
  const roLeft = ent.readOnlyDaysLeft
  const persons = Math.max(cap.usage.persons, cap.usage.members + cap.usage.pendingInvites)
  const query = pickerQuery({ add: p.get('add'), muster: p.get('muster'), products: p.get('products') }, parsePlanIntentQuery(org.planIntent), Boolean(current))
  const start = pickerStart(sub, cap.usage, query)
  const pickerProps = { initial: start, defaults: defaultSelections(cap.usage), persons, testMode, paymentsOff, supplierState, supplierGstin, billingState, prices: ctx.planConfig.prices, hideMuster: !kindAllowsProduct(workspaceKindOf(org), 'muster') }
  // A new checkout's yearly price gets the first-year discount when this workspace has never paid for a year.
  const firstYearPercent = await firstYearDiscountFor(ctx.orgId, 'yearly', ctx.planConfig.yearlyDiscountPercent)

  // Blank billing details prefill from the company profile (the one source of company details).
  const company = companyProfileOf(org)
  const billingDefaults: BillingDefaults = {
    legalName: billing?.legalName ?? company.legalName,
    email: billing?.email ?? company.email ?? ctx.user.email,
    phone: billing?.phone ?? company.phone ?? '',
    gstin: billing?.gstin ?? company.gstin ?? '',
    address: {
      line1: billing?.address?.line1 ?? company.address.line1 ?? '',
      line2: billing?.address?.line2 ?? company.address.line2 ?? '',
      city: billing?.address?.city ?? company.address.city ?? '',
      stateCode: billing?.address?.stateCode ?? company.address.state ?? '',
      pincode: billing?.address?.pincode ?? company.address.pincode ?? '',
    },
  }

  // Free runs from signup to trialEndsAt (6 months); a trial runs the Console's trial days.
  const windowDays = free && sub?.trialEndsAt ? Math.max(1, Math.round((new Date(sub.trialEndsAt).getTime() - new Date(org.createdAt).getTime()) / DAY_MS)) : ctx.planConfig.trialDays
  const trialElapsed = sub?.trialEndsAt ? Math.min(100, Math.max(0, 100 - ((trialLeft ?? 0) / windowDays) * 100)) : 0
  const per = sub?.cycle === 'yearly' ? 'year' : 'month'
  const amount = sub?.amountPaise ?? 0
  const paymentLine = sub?.manual ? 'Set by Flowbit' : sub?.razorpaySubscriptionId ? `Razorpay · ${sub.razorpaySubscriptionId}` : 'Test mode (simulated)'
  const pending = sub?.pendingChange
  const pendingSelection = pending ? selectionOf(pending) : null
  const showPicker = !isActive
  const lc = ent.lifecycle
  const returnRefusal = freeReturnRefusal(org, billableSeats(cap.usage), new Date(), ctx.planConfig.freeSeats)
  const lifecycleView = { stage: lc.stage, accountType: lc.accountType, daysLeft: lc.daysLeft, endsAt: lc.endsAt?.toISOString() ?? null, deleteAt: lc.deleteAt?.toISOString() ?? null, freeWindowEndsAt: lc.freeWindowEndsAt?.toISOString() ?? null, freeSeats: ctx.planConfig.freeSeats }

  return (
    <>
      {header}

      {dueBills ? <Notice tone="warning" className="mb-4" action={<a href={BILLS_TAB_HREF} className="text-sm text-white underline">Open Bills and invoices</a>}>Flowbit has sent you {dueBills === 1 ? 'a bill' : `${dueBills} bills`} to pay. Pay online or by bank transfer from Bills and invoices.</Notice> : null}
      <div className="grid grid-cols-12 gap-4">
        <LifecyclePanel
          view={lifecycleView}
          trialAvailable={ent.trialAvailable}
          canReturnToFree={returnRefusal === null}
          returnHint={returnRefusal === 'too_many' ? freeReturnMessage('too_many', ctx.planConfig.freeSeats) : null}
          isOwner={ctx.isOwner}
          showUpgrade={showPicker}
        />
        <Card className="col-span-12 rounded-[16px] lg:col-span-7">
          <CardHeader label="Current plan" icon={<Layers strokeWidth={1.5} />} />
          {status === 'trialing' ? (
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <p className="text-[56px] font-semibold leading-[0.9] tabular-nums text-white">{trialLeft}</p>
                <p className="pb-1 text-sm text-white/80">
                  {trialLeft === 1 ? 'day' : 'days'} left {free ? 'on the Free plan' : 'of your free trial'}
                  <span className="block text-[13px] text-[#959596]">{free ? `Every product for up to ${ctx.planConfig.freeSeats} people.` : 'Every product is switched on.'}</span>
                </p>
              </div>
              <div className="rounded-[12px] bg-white/[0.04] p-2.5">
                <Progress value={trialElapsed} size="lg" />
              </div>
              <p className="text-[13px] text-[#959596]">{Math.round(trialElapsed)}% of the {free ? 'free months' : 'trial'} used. Ends {sub?.trialEndsAt ? formatDate(new Date(sub.trialEndsAt)) : '—'}. Choose a plan below to keep editing after that.</p>
            </div>
          ) : isActive || status === 'past_due' || status === 'canceled' ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">{current ? selectionLabel(current) : 'Custom plan'}</p>
              <p className="text-sm text-white/80">
                {sub?.cycle === 'yearly' ? 'Yearly' : 'Monthly'} · {formatINR(amount, { decimals: 2 })} per {per}{supplierGstin ? ' + GST' : ''}
              </p>
              {sub?.manual && sub?.currentPeriodEnd && status !== 'canceled' ? (
                <p className="flex items-center gap-1.5 text-sm text-white/80"><CalendarClock className="size-4 text-icon-muted" strokeWidth={1.5} /> Runs until {lastDay(sub.currentPeriodEnd)}</p>
              ) : status === 'canceled' && sub?.currentPeriodEnd ? (
                <p className="text-sm text-white/80">Ends on {lastDay(sub.currentPeriodEnd)}. You won&apos;t be charged again. To keep Flowbit after that, choose a plan below; it starts when this one ends.</p>
              ) : sub?.currentPeriodEnd ? (
                <p className="flex items-center gap-1.5 text-sm text-white/80"><CalendarClock className="size-4 text-icon-muted" strokeWidth={1.5} /> Renews on {formatDate(new Date(sub.currentPeriodEnd))}</p>
              ) : null}
              {status === 'past_due' ? <p className="text-sm text-warning">Payment failed{sub?.pastDueSince || sub?.currentPeriodEnd ? ` on ${formatDate(new Date((sub?.pastDueSince ?? sub?.currentPeriodEnd)!))}` : ''}. {testMode ? 'Simulate the payment to settle it.' : 'Razorpay retries automatically; you can also pay again below.'}</p> : null}
              <p className="text-[13px] text-[#959596]">Payment: {paymentLine}</p>
              {isActive && sub?.manual ? <p className="text-sm text-white/80">Flowbit manages this plan for you, so it doesn&apos;t renew or change here. To add seats or products, or to extend it, email <a className="text-orchid hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p> : null}
              {isActive && paymentsOff && !sub?.manual ? <p className="text-sm text-white/80">Online payments aren&apos;t set up on this server yet. To change your plan, email <a className="text-orchid hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p> : null}
              <div className="flex flex-wrap gap-2 pt-2">
                {isActive && !sub?.manual && !paymentsOff ? <ChangePlanDialog {...pickerProps} active={{ amountPaise: amount, cycle: (sub?.cycle ?? 'monthly') as BillingCycle, periodStart: new Date(sub!.currentPeriodStart!).toISOString(), periodEnd: new Date(sub!.currentPeriodEnd!).toISOString() }} defaultOpen={Boolean(p.get('add') || p.get('muster'))} /> : null}
                {isActive && testMode ? <SimulateRenewalButton /> : null}
                {status === 'past_due' && testMode ? <SimulateRenewalButton label="Simulate payment" /> : null}
                {isActive && ctx.isOwner && !sub?.manual && sub?.currentPeriodEnd ? <CancelSubscriptionButton until={lastDay(sub.currentPeriodEnd)} /> : null}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">{sub?.plan === 'trial' ? `Your ${free ? 'free months' : 'trial'} ended on ${sub?.trialEndsAt ? formatDate(new Date(sub.trialEndsAt)) : '—'}` : `Your plan ended${sub?.endedAt || sub?.currentPeriodEnd ? ` on ${formatDate(new Date((sub?.endedAt ?? sub?.currentPeriodEnd)!))}` : ''}`}</p>
              {ent.access === 'blocked' ? (
                <p className="text-sm text-[#FF6A66]">Locked. Your data is safe; choose a plan to open the workspace again.</p>
              ) : roLeft != null ? (
                <p className="text-sm text-warning">Read-only until {formatDate(new Date(Date.now() + roLeft * DAY_MS))}. Choose a plan to keep editing.</p>
              ) : null}
            </div>
          )}
          {pending && pendingSelection ? (
            <Notice tone="info" className="mt-4" action={<CancelChangeButton />}>
              From {formatDate(new Date(pending.effectiveAt))}: {selectionLabel(pendingSelection)}, {pending.cycle} ({formatINR(pending.amountPaise ?? 0)}{supplierGstin ? ' + GST' : ''}).
            </Notice>
          ) : null}
        </Card>
        <div className="col-span-12 lg:col-span-5">
          <UsageCard rows={cap.rows} trial={ent.trialing && ent.seatLimit == null} />
        </div>

        {showPicker ? (
          <section className="col-span-12" id="plans">
            <h2 className="section-label mb-3 mt-2">Choose a plan</h2>
            {paymentsOff ? (
              <Notice tone="info" className="mb-4">
                Online payments aren&apos;t set up on this server yet, so plans can&apos;t be bought here. You can still compare prices below. To choose a plan, email <a className="text-orchid hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.
              </Notice>
            ) : null}
            <PlanPicker {...pickerProps} discountPercent={firstYearPercent} active={null} />
          </section>
        ) : null}

        <div className="col-span-12">
          <BillingDetailsForm defaults={billingDefaults} saved={Boolean(billing?.legalName)} />
        </div>
      </div>
    </>
  )
}
