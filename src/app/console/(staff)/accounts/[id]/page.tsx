import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { Activity, Building2, ClipboardCheck, CreditCard, ExternalLink, HeartPulse, KeyRound, StickyNote, Upload } from 'lucide-react'
import { ACCOUNT_TYPE_LABEL } from '@/lib/account-types'
import { handoverProgress, HANDOVER_STEPS } from '@/lib/console/handover'
import { requireStaff } from '@/lib/console/session'
import { activeGrant, dpaAccepted, grantsFor, internalLocked, showsWorkspaceAudit, SUPPORT_MODE_LABEL, supportStatus } from '@/lib/console/support-access'
import { formatDate, formatDateTime, isoDateIST } from '@/lib/dates'
import { entitlements } from '@/lib/entitlements'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR, paiseToRupees } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { KeyValue } from '@/components/ui/key-value'
import { PageHeader } from '@/components/ui/page-header'
import { Timeline } from '@/components/ui/timeline'
import { FilterPills } from '@/components/settings/filter-pills'
import { FactRow, SurfaceHeader } from '@/components/settings/surface'
import { AssignSalesperson, HandoverChecklist, NoteForm, SupportRequestButton } from '@/components/console/account-panels'
import { HealthDot } from '@/components/console/health-dot'
import { ConsoleAuditNote, OrgActions } from '@/components/console/org-actions'
import { CreateBillDialog } from '@/components/console/billing-actions'
import { STATE_TONE } from '@/components/console/state-tone'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { Staff } from '@/models/console/Staff'
import { SupportAccess } from '@/models/console/SupportAccess'
import { HEALTH_LABEL, SIGNAL_LABEL, SIGNALS, type HealthScore, type SignalValue } from '@/modules/console/health'
import { mrrOf, orgState } from '@/modules/console/metrics'
import { planConfig } from '@/modules/console/settings-query'
import { accountTimeline } from '@/modules/console/timeline-query'
import { selectionLabel, selectionOf } from '@/modules/subscription/selection'
import { usageOf } from '@/modules/subscription/usage'
import { AuditTab, InvoicesTab, lastSeenByUser, MembersTab } from './tabs'
import { WalletTab } from './wallet-tab'
import { whatsAppEnabled } from '@/modules/features/flags'

export const metadata: Metadata = { title: 'Account' }
const dt = (v: Date | string | null | undefined) => (v ? formatDateTime(v) : '—')

export default async function ConsoleAccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const p = await requireStaff('accounts.view')
  const now = new Date()
  if (!isValidObjectId(id)) notFound()
  const org = await p.raw(Org).findById(id).lean()
  if (!org || internalLocked(org.subscription?.accountType, p.staff.isFounder)) notFound()
  const scoped = p.forOrg(org._id)
  const whatsappOn = await whatsAppEnabled()
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'subscription', label: 'Subscription' },
    ...(p.can('billing.view') ? [{ key: 'invoices', label: 'Invoices' }] : []),
    ...(whatsappOn && (p.can('billing.view') || p.can('wallet.grant')) ? [{ key: 'wallet', label: 'WhatsApp wallet' }] : []),
    { key: 'members', label: 'Members' },
    { key: 'audit', label: 'Audit' },
  ]
  const tab = tabs.some((t) => t.key === first(sp.tab)) ? first(sp.tab)! : 'overview'
  const base = `/console/accounts/${id}`
  const sub = org.subscription
  const { state, label } = orgState(org)
  const current = selectionOf(sub)

  const [members, usage, account, sales, grants] = await Promise.all([
    scoped.db(Member).find({}).sort({ status: 1, joinedAt: 1 }).lean(),
    usageOf({ orgId: org._id, db: scoped.db }),
    p.raw(ConsoleAccount).findOne({ orgId: org._id }).lean(),
    p.raw(Staff).find({ status: 'active', role: { $in: ['sales', 'admin'] } }, { name: 1 }).sort({ name: 1 }).lean(),
    scoped.db(SupportAccess).find({}).sort({ createdAt: -1 }).limit(10).lean(),
  ])
  const users = await p.raw(User).find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1, phone: 1 }).lean()
  const userOf = (uid: unknown) => users.find((u) => String(u._id) === String(uid))
  const owner = members.find((m) => m.role === 'owner' && m.status === 'active')
  const ownerUser = owner ? userOf(owner.userId) : undefined
  const config = await planConfig()
  const ent = entitlements(org, now, usage, config)
  const health = (account?.health?.score as HealthScore | undefined) ?? null
  const signals = (account?.health?.signals ?? null) as Record<string, SignalValue> | null
  const setup = handoverProgress(account?.handover)
  const doneSteps = Object.fromEntries(HANDOVER_STEPS.flatMap((s) => (account?.handover?.steps?.[s]?.doneAt ? [[s, new Date(account.handover.steps[s]!.doneAt!).toISOString()]] : [])))
  const readGrant = activeGrant(grantsFor(grants, p.staff.id), 'read')
  // The last IST day of the period (as the subscription page shows it), not the UTC day.
  const periodEndInclusive = sub?.currentPeriodEnd ? isoDateIST(new Date(new Date(sub.currentPeriodEnd).getTime() - 1)) : isoDateIST(new Date(now.getTime() + 30 * 86_400_000))

  return (
    <>
      <PageHeader title={org.name} description={`${org.slug} · signed up ${formatDate(org.createdAt)}`} back={{ href: '/console/accounts', label: 'Accounts' }} actions={<Badge tone={STATE_TONE[state]} size="md">{label}</Badge>}>
        <div className="space-y-3">
          <OrgActions
            orgId={id}
            slug={org.slug}
            name={org.name}
            plan={sub?.plan ?? 'trial'}
            trialing={state === 'trial' || state === 'free'}
            accountType={ent.accountType}
            compedUntil={sub?.compedUntil ? isoDateIST(new Date(sub.compedUntil)) : ''}
            disabled={Boolean(org.disabled)}
            deleted={Boolean(org.deletedAt)}
            hasRazorpay={Boolean(sub?.razorpaySubscriptionId)}
            extensions={account?.trialExtensions ?? 0}
            salesExtensionDays={config.salesExtensionDays}
            addOns={[...(sub?.addOns ?? [])]}
            can={{ extend: p.can('trial.extend_once'), extendMore: p.can('trial.extend_more'), endTrial: p.can('trial.end'), plan: p.can('account.set_plan'), type: p.can('account.set_type'), status: p.can('account.set_status'), disable: p.can('account.disable'), restore: p.can('account.restore') }}
            current={{
              plan: sub?.plan ?? 'suite',
              seats: sub?.seats ?? 10,
              work: sub?.quantities?.work ?? 0,
              musterTier: sub?.products?.muster ?? 'none',
              muster: sub?.quantities?.muster ?? 0,
              orbit: sub?.quantities?.orbit ?? 0,
              folio: Boolean(sub?.products?.folio),
              cycle: sub?.cycle ?? 'monthly',
              periodEnd: periodEndInclusive,
              amountRupees: String(paiseToRupees(sub?.amountPaise ?? 0)),
            }}
          />
          {p.can('bill.create') && ent.billed ? (
            <div className="flex flex-wrap items-center gap-2">
              <CreateBillDialog orgId={id} hasPlan={Boolean(current && sub?.plan !== 'trial')} defaultCycle={sub?.cycle ?? 'monthly'} defaultSeats={Math.max(sub?.seats ?? 0, ent.seatsUsed ?? 0, 1)} />
              {sub?.provisionalUntil && new Date(sub.provisionalUntil) > now ? <span className="text-xs text-[#979797]">Provisional access until {formatDate(new Date(sub.provisionalUntil))} (offline payment awaiting verification)</span> : null}
              {sub?.autopay?.status ? <span className="text-xs text-[#979797]">Autopay: {sub.autopay.status}</span> : null}
            </div>
          ) : null}
          <ConsoleAuditNote name={p.staff.name} />
          <FilterPills label="Account sections" items={tabs.map((t) => ({ href: buildHref(base, {}, { tab: t.key === 'overview' ? undefined : t.key }), label: t.label, active: tab === t.key }))} />
        </div>
      </PageHeader>

      {tab === 'overview' ? (
        <div className="grid grid-cols-12 gap-4">
          <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-7">
            <SurfaceHeader icon={<Building2 strokeWidth={1.5} />} label="Account" />
            <div className="mt-3">
              <FactRow label="Owner">{ownerUser ? `${ownerUser.name} · ${ownerUser.email}${ownerUser.phone ? ` · ${ownerUser.phone}` : ''}` : 'No active owner'}</FactRow>
              <FactRow label="Type">{`${ent.accountTypeLabel}${ent.inMetrics ? '' : ' · not billed, left out of metrics'}${sub?.compedUntil ? ` · until ${formatDate(sub.compedUntil)}` : ''}`}</FactRow>
              <FactRow label="Plan">{current ? selectionLabel(current) : ent.accountType === 'free' ? 'Free' : 'Trial'}{ent.lifecycle.daysLeft != null && (ent.lifecycle.stage === 'free' || ent.lifecycle.stage === 'trial') ? ` · ${ent.lifecycle.daysLeft} days left` : ''}</FactRow>
              <FactRow label="Seats used"><span className="tabular-nums">{ent.seatsUsed ?? '—'} of {ent.seatLimit ?? 'no limit'}</span></FactRow>
              <FactRow label="MRR"><span className="tabular-nums">{formatINR(mrrOf(sub))}</span></FactRow>
              <FactRow label="Salesperson"><AssignSalesperson orgId={id} current={account?.salespersonId ? String(account.salespersonId) : null} options={sales.map((s) => ({ value: String(s._id), label: s.name }))} canAssign={p.can('accounts.assign')} /></FactRow>
              <FactRow label="Team size">{org.teamSize ?? '—'}</FactRow>
              <FactRow label="GSTIN">{org.gstin || '—'}</FactRow>
              <FactRow label="Disabled">{org.disabled ? `${dt(org.disabledAt)} · ${org.disabledReason ?? ''}` : 'No'}</FactRow>
            </div>
          </section>
          <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-5">
            <SurfaceHeader icon={<HeartPulse strokeWidth={1.5} />} label="Health" description={account?.health?.computedAt ? `Computed ${formatDateTime(account.health.computedAt)}` : 'Computed nightly from product use'} />
            <div className="mt-3 flex items-center gap-2"><HealthDot score={health} withLabel /></div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {SIGNALS.map((s) => {
                const v = signals?.[s]
                return (
                  <li key={s} className="flex items-center justify-between gap-3">
                    <span className="text-fg-2">{SIGNAL_LABEL[s]}</span>
                    <span className={v?.formed ? 'text-[#2DCBAF]' : 'text-white'}>{v ? `${v.value} / ${v.target}${v.formed ? ' · habit' : ''}` : '—'}</span>
                  </li>
                )
              })}
            </ul>
            {health ? <p className="mt-3 text-xs text-fg-2">{HEALTH_LABEL[health]}: {health === 'green' ? 'people come back and at least one product is a habit.' : health === 'amber' ? 'some use, no full habit yet.' : 'no real use this week.'}</p> : null}
          </section>
          <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-4">
            <SurfaceHeader icon={<ClipboardCheck strokeWidth={1.5} />} label="Handover" description={`${setup.done} of ${setup.total} done${setup.complete ? ' · live' : ''}`} />
            <div className="mt-3"><HandoverChecklist orgId={id} done={doneSteps} canEdit={p.can('handover.manage')} started={setup.started} /></div>
          </section>
          <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-4">
            <SurfaceHeader icon={<KeyRound strokeWidth={1.5} />} label="Support access" description={`DPA: ${dpaAccepted(org.dpa) ? `accepted ${formatDate(org.dpa!.acceptedAt!)}` : 'not accepted'}`} actions={p.can('support.request') ? <SupportRequestButton orgId={id} canImport={p.can('import.run')} /> : null} />
            <ul className="mt-3 space-y-2 text-sm">
              {grants.length ? grants.slice(0, 5).map((g) => (
                <li key={String(g._id)} className="flex items-start justify-between gap-3">
                  <span className="min-w-0"><span className="block text-white">{SUPPORT_MODE_LABEL[g.mode]} · {g.staffName}</span><span className="block text-xs text-fg-2">{g.reason}</span></span>
                  <span className="shrink-0 text-xs text-[#979797]">{supportStatus(g) === 'active' ? `until ${formatDateTime(g.expiresAt!)}` : supportStatus(g)}</span>
                </li>
              )) : <li className="text-fg-2">No requests yet.</li>}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {readGrant ? <Link href={`${base}/support`} className={buttonClass('secondary', 'sm')}><ExternalLink className="size-3.5" /> Open support view</Link> : null}
              {p.can('import.run') ? <Link href={`${base}/import`} className={buttonClass('secondary', 'sm')}><Upload className="size-3.5" /> Import data</Link> : null}
            </div>
          </section>
          <section className="glass col-span-12 rounded-[14px] p-5 lg:col-span-4">
            <SurfaceHeader icon={<StickyNote strokeWidth={1.5} />} label="Notes" />
            {p.can('accounts.note') ? <div className="mt-3"><NoteForm orgId={id} /></div> : null}
            <ul className="mt-3 space-y-2.5 text-sm">
              {(account?.notes ?? []).slice(0, 10).map((n) => (
                <li key={String(n._id)}><span className="block whitespace-pre-line text-white">{n.text}</span><span className="text-xs text-[#979797]">{n.staffName} · {formatDateTime(n.at)}</span></li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'timeline' ? (
        <Card variant="solid">
          <CardHeader label="Timeline" icon={<Activity strokeWidth={1.5} />} description="Signup, product use by day (last 30 days), plan changes, payments, messages and imports" />
          <Timeline items={(await accountTimeline(p, org)).map((item, i) => ({ id: `${item.kind}-${i}`, title: item.title, at: item.at, meta: <span>{item.kind}{item.detail ? ` · ${item.detail}` : ''}</span> }))} />
        </Card>
      ) : null}

      {tab === 'subscription' ? (
        <Card variant="solid">
          <CardHeader label="Subscription" icon={<CreditCard strokeWidth={1.5} />} />
          <KeyValue
            columns={3}
            items={[
              { label: 'Account type', value: ACCOUNT_TYPE_LABEL[ent.accountType] },
              { label: 'Stored status', value: sub?.status },
              { label: 'Plan', value: sub?.plan },
              { label: 'Cycle', value: sub?.cycle },
              { label: 'Seats', value: sub?.seats },
              { label: 'Amount per period', value: formatINR(sub?.amountPaise ?? 0, { decimals: 2 }) },
              { label: 'Trial ends', value: dt(sub?.trialEndsAt) },
              { label: 'Free window ends', value: dt(sub?.freeEndsAt) },
              { label: 'Period end', value: dt(sub?.currentPeriodEnd) },
              { label: 'Past due since', value: dt(sub?.pastDueSince) },
              { label: 'Pending change', value: sub?.pendingChange ? `${selectionLabel(selectionOf(sub.pendingChange)!)} from ${formatDate(new Date(sub.pendingChange.effectiveAt))}` : 'None' },
              { label: 'Manual', value: sub?.manual?.note ? `${sub.manual.note} (${dt(sub.manual.setAt)})` : 'No' },
              { label: 'Billing name', value: sub?.billing?.legalName },
              { label: 'Billing email', value: sub?.billing?.email },
              { label: 'Razorpay subscription', value: sub?.razorpaySubscriptionId ?? 'None' },
            ]}
          />
        </Card>
      ) : null}

      {tab === 'invoices' ? <InvoicesTab scoped={scoped} canCancel={p.can('invoice.cancel')} /> : null}
      {tab === 'wallet' ? <WalletTab scoped={scoped} orgId={id} canGrant={p.can('wallet.grant')} /> : null}
      {tab === 'members' ? (
        <MembersTab members={members.map((m) => ({ id: String(m._id), name: userOf(m.userId)?.name ?? '—', email: userOf(m.userId)?.email ?? '', role: m.role, status: m.status, userId: String(m.userId) }))} lastSeen={await lastSeenByUser(p, org._id)} scoped={scoped} />
      ) : null}
      {tab === 'audit' ? <AuditTab scoped={scoped} showWorkspace={showsWorkspaceAudit(p.staff.role, Boolean(readGrant))} /> : null}
    </>
  )
}
