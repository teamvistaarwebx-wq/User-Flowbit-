import type { Metadata } from 'next'
import { productLabel } from '@/lib/catalog'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlarmClock, Banknote, Building2, CalendarClock, CalendarDays, ChartColumn, CircleCheck, CircleDashed, FilePlus2, FileText, Hourglass, IndianRupee, ListChecks, PhoneCall, Repeat, Scale, Settings2, UserRound, Wallet } from 'lucide-react'
import type { Ctx } from '@/lib/ctx'
import { requireMember } from '@/lib/ctx'
import { addDays, formatDate, formatMonth, greeting, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact, pct } from '@/lib/money'
import { cn, firstName } from '@/lib/utils'
import { BarChart } from '@/components/charts/bar-chart'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { AgingBar } from '@/components/folio/AgingBar'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { Figure, GlassCard, HeroCard, Note, PanelHeader, SolidCard, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from '@/components/folio/ui'
import type { FirmOption } from '@/modules/folio/engine/firm'
import { asOfLabel, rangeLabel, resolveBoundedPeriod, throughThisMonth, type BoundedPeriod } from '@/modules/folio/engine/period'
import { forecastTotal } from '@/modules/folio/forecast/forecast'
import { billingForecast } from '@/modules/folio/forecast/queries'
import { profitAndLoss } from '@/modules/folio/pnl/queries'
import { firmContext } from '@/modules/folio/queries/common'
import { folioDashboard } from '@/modules/folio/queries/dashboard'

export const metadata: Metadata = { title: 'Folio' }

/** "Friday, 2 October" under the greeting, as on Home. */
const LONG_DATE = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })

/** Series colours: billed in the "in progress" indigo, collected in the "completed" teal (Figma status set). */
const BILLED = 'var(--info)'
const COLLECTED = 'var(--success)'

/** One "Needs a person" row; without `href` (the viewer can't open the target) it renders as plain text. */
function WorkRow({ href, icon, label, value, hint, alert }: { href?: string; icon: ReactNode; label: string; value: ReactNode; hint: string; alert?: boolean }) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0 text-icon-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-white">{label}</span>
        <span className="block truncate text-xs text-fg-2">{hint}</span>
      </span>
      <span className={cn('shrink-0 text-lg font-semibold tabular-nums', alert ? 'text-warning' : 'text-white')}>{value}</span>
    </>
  )
  const base = 'flex items-start gap-3 px-[23px] py-2.5'
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(base, TBODY_ROW)}>
          {body}
        </Link>
      ) : (
        <div className={base}>{body}</div>
      )}
    </li>
  )
}

function FirstSteps({ hasEntity, canSettings, canInvoice }: { hasEntity: boolean; canSettings: boolean; canInvoice: boolean }) {
  const steps = [
    { done: hasEntity, icon: <Settings2 />, title: 'Set up your firm', body: 'The business you bill from: GST or non-GST, address, bank and number series.', href: canSettings ? '/app/folio/settings' : null, cta: 'Open settings' },
    { done: false, icon: <Building2 />, title: 'Add a client', body: 'Name, GSTIN and billing state decide CGST+SGST or IGST.', href: '/app/clients/new', cta: 'Add client' },
    { done: false, icon: <FilePlus2 />, title: 'Raise an invoice', body: 'Draft it, check the totals, then issue it to take the next number.', href: canInvoice ? '/app/folio/invoices/new' : null, cta: 'New invoice' },
  ]
  return (
    <SolidCard className="col-span-12">
      <PanelHeader icon={<ListChecks />} title="Bill your first client" subtitle="Three steps and Folio starts tracking what you are owed." />
      <ol className="mt-5 grid gap-y-5 md:grid-cols-3 md:divide-x md:divide-line-soft/40">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col md:px-6 md:first:pl-0 md:last:pr-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">
              {s.done ? <CircleCheck className="size-4 text-[#2DCBAF]" strokeWidth={1.5} /> : <CircleDashed className="size-4 text-white" strokeWidth={1.5} />}
              Step {i + 1}
              <span className="font-normal normal-case tracking-normal text-fg-3">· {s.done ? 'Done' : 'To do'}</span>
            </p>
            <p className="mt-3 text-sm font-medium text-white">{s.title}</p>
            <p className="mt-1 text-[13px] leading-5 text-fg-2">{s.body}</p>
            {s.href && !s.done ? (
              <Button size="sm" variant="secondary" className="mt-4 self-start" href={s.href}>
                {s.cta}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </SolidCard>
  )
}

/** Expected billing from retainers and milestones: next 3 and next 6 months. */
async function ForecastCard({ ctx, firm }: { ctx: Ctx; firm: FirmOption | null }) {
  const f = await billingForecast(ctx, { entityId: firm?.id ?? null, months: 6 })
  const three = forecastTotal(f, 3)
  const six = forecastTotal(f, 6)
  const short = (m: string) => formatMonth(m).slice(0, 3)
  const span = (n: number) => `${short(f.months[0])} – ${formatMonth(f.months[n - 1])}`
  return (
    <GlassCard className="col-span-12 lg:col-span-5">
      <PanelHeader
        icon={<CalendarClock />}
        title="Expected billing"
        subtitle="Active retainers and dated milestones, before GST"
        actions={
          <Link href={buildHref('/app/folio/forecast', {}, { firm: firm?.code })} className="text-xs font-medium text-white transition-opacity hover:opacity-75">
            View forecast
          </Link>
        }
      />
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Figure label="Next 3 months" value={formatINRCompact(three)} hint={span(3)} />
        <Figure label="Next 6 months" value={formatINRCompact(six)} hint={span(6)} />
      </div>
      <div className="mt-5 flex-1">
        {six > 0 ? (
          <BarChart labels={f.months.map(short)} stacked series={[{ name: 'Retainers', color: BILLED, data: f.byMonth.map((m) => m.retainerPaise) }, { name: 'Milestones', color: 'var(--violet)', data: f.byMonth.map((m) => m.milestonePaise) }]} formatValue={formatINRCompact} height={150} />
        ) : (
          <p className="text-[13px] text-fg-2">No active retainers or dated milestones. Add one under Recurring and it shows here.</p>
        )}
      </div>
    </GlassCard>
  )
}

/** Income, costs and net profit for the chosen period (needs folio.reports). */
async function PnlCard({ ctx, firm, period, today }: { ctx: Ctx; firm: FirmOption | null; period: BoundedPeriod; today: string }) {
  const range = throughThisMonth(period, today)
  const pnl = await profitAndLoss(ctx, { ...range, entityId: firm?.id ?? null })
  const link = buildHref('/app/folio/pnl', {}, { firm: firm?.code, period: period.key, from: period.key === 'custom' ? period.from : undefined, to: period.key === 'custom' ? period.to : undefined })
  const costsHint = pnl.payroll.state === 'included' ? 'Expenses and Muster salaries' : pnl.payroll.state === 'muster_off' ? 'Expenses · Muster not active' : 'Expenses only'
  return (
    <SolidCard className="col-span-12">
      <PanelHeader
        icon={<Scale />}
        title="Profit and loss"
        subtitle={`${period.noun[0].toUpperCase()}${period.noun.slice(1)} · ${rangeLabel(range.from, range.to)} · billing-based`}
        actions={
          <>
            {ctx.can('expenses.read') ? <Button size="sm" variant="ghost" href={buildHref('/app/folio/expenses', {}, { firm: firm?.code })}>Expenses</Button> : null}
            <Button size="sm" variant="secondary" href={link}>Full P&amp;L</Button>
          </>
        }
      />
      <div className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line-soft/40">
        <Figure className="sm:pr-6" label="Net income" value={formatINR(pnl.incomePaise, { decimals: 0 })} hint="Invoiced, before GST, less credit notes" />
        <Figure className="sm:px-6" label="Costs" value={formatINR(pnl.costsPaise, { decimals: 0 })} hint={costsHint} />
        <Figure className="sm:pl-6" label="Net profit" value={formatINR(pnl.netPaise, { decimals: 0 })} valueClassName={pnl.netPaise < 0 ? 'text-[#FF6A66]' : 'text-[#2DCBAF]'} hint={pnl.marginPercent === null ? 'No income in this period' : `${pnl.marginPercent}% margin`} />
      </div>
    </SolidCard>
  )
}

export default async function FolioDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const today = todayIST()
  const period = resolveBoundedPeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'this_month')
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  const d = await folioDashboard(ctx, today, { entityId: firm?.id ?? null, period })
  const collectedDelta = d.collectedPreviousPaise ? Math.round(((d.collectedPaise - d.collectedPreviousPaise) / d.collectedPreviousPaise) * 100) : null
  const canInvoice = ctx.can('invoices.write')
  const canReceipt = ctx.can('receipts.write')
  const asOf = asOfLabel(d.today)
  const AsOf = `${asOf[0].toUpperCase()}${asOf.slice(1)}`
  const keep = { firm: firm?.code }
  const inPeriod = { ...keep, period: period.key, from: period.key === 'custom' ? period.from : undefined, to: period.key === 'custom' ? period.to : undefined }
  const at = (path: string, extra: Record<string, string | undefined> = {}) => buildHref(path, {}, { ...keep, ...extra })
  const trendSpan = d.trend.length ? `${formatMonth(d.trend[0].month).slice(0, 3)} – ${formatMonth(d.trend[d.trend.length - 1].month)}` : ''
  const verb = (word: string) => `${word} ${period.noun}`

  return (
    <div className="@container">
      <header className="mb-6 flex flex-col gap-4 animate-slide-up sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">{productLabel('folio')}</p>
          <h1 className="text-xl font-medium leading-6 text-white">
            {greeting()}, <span className="text-name">{firstName(ctx.user.name)}</span>
          </h1>
          <p className="mt-2 text-sm text-white">
            {LONG_DATE.format(new Date())}
            <span className="text-white/60"> · {firm ? `${firm.name}, ` : ''}where the money stands today</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon={<PhoneCall className="size-4" />} href={at('/app/folio/collections')}>Work the queue</Button>
          {canReceipt ? <Button variant="secondary" icon={<Banknote className="size-4" />} href="/app/folio/receipts/new">Record payment</Button> : null}
          {canInvoice ? <Button variant="primary" icon={<FilePlus2 className="size-4" />} href="/app/folio/invoices/new">New invoice</Button> : null}
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FirmSwitch base="/app/folio" params={sp} firms={firms} firm={firm} />
        <PeriodPicker base="/app/folio" params={sp} period={period} today={today} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!d.hasEntity ? (
          <Note className="col-span-12" tone="warning" title="Set up your firm first." action={ctx.can('folio.settings') ? <Button size="sm" variant="primary" href="/app/folio/settings">Set up billing</Button> : null}>
            Invoices, receipts and statements are issued in its name.
          </Note>
        ) : null}
        {!d.hasInvoices ? <FirstSteps hasEntity={d.hasEntity} canSettings={ctx.can('folio.settings')} canInvoice={canInvoice} /> : null}
        {d.unappliedPaise > 0 ? (
          <Note
            className="col-span-12"
            icon={<Wallet />}
            action={
              <Link href={at('/app/folio/receipts', { unallocated: '1' })} className="text-[13px] font-medium text-white transition-opacity hover:opacity-75">
                Apply it
              </Link>
            }
          >
            <span className="font-semibold text-white">{formatINR(d.unappliedPaise)}</span> received but not applied to any invoice, {asOf}.
          </Note>
        ) : null}

        <HeroCard className="col-span-12">
          <PanelHeader
            icon={<Hourglass />}
            title="Receivables by age"
            subtitle={`${formatINR(d.aging.total, { decimals: 0 })} open ${firm ? `for ${firm.name}` : 'across every client'}, ${asOf}`}
            actions={
              ctx.can('folio.reports') ? (
                <Link href={at('/app/folio/reports', { report: 'aging' })} className="text-xs font-medium text-white transition-opacity hover:opacity-75">
                  Aging report
                </Link>
              ) : undefined
            }
          />
          <AgingBar className="mt-4" aging={d.aging} hrefFor={() => at('/app/folio/collections')} />
        </HeroCard>

        <div className="col-span-12 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Outstanding" value={formatINRCompact(d.netReceivablePaise)} hint={`${AsOf} · ${formatINR(d.outstandingPaise, { decimals: 0 })} on open invoices less unapplied money`} color="var(--violet)" href={at('/app/folio/ledger')} />
          <StatCard label="Overdue" value={formatINRCompact(d.overduePaise)} hint={`${AsOf} · ${d.overdueCount} ${d.overdueCount === 1 ? 'invoice' : 'invoices'}, ${pct(d.overduePaise, d.outstandingPaise)}% of the book`} color="var(--danger)" href={at('/app/folio/collections')} />
          <StatCard label={verb('Collected')} value={formatINRCompact(d.collectedPaise)} delta={collectedDelta} trend={d.trend.map((t) => t.collectedPaise)} color={COLLECTED} hint={`${period.window}${d.previous ? (collectedDelta === null ? ` · nothing ${d.previous.noun} to compare` : ` · vs ${d.previous.noun}`) : ''}`} href={buildHref('/app/folio/receipts', {}, inPeriod)} />
          <StatCard label={verb('Billed')} value={formatINRCompact(d.billedPaise)} trend={d.trend.map((t) => t.billedPaise)} color={BILLED} hint={`${period.window} · tax included · ${d.draftCount} ${d.draftCount === 1 ? 'draft' : 'drafts'} waiting`} href={buildHref('/app/folio/invoices', {}, inPeriod)} />
        </div>

        <GlassCard className="col-span-12 lg:col-span-7">
          <PanelHeader icon={<ChartColumn />} title="Billed vs collected" subtitle={`Last six months, ${trendSpan}, tax included`} />
          <div className="mt-5 flex-1">
            <BarChart labels={d.trend.map((t) => formatMonth(t.month).slice(0, 3))} series={[{ name: 'Billed', color: BILLED, data: d.trend.map((t) => t.billedPaise) }, { name: 'Collected', color: COLLECTED, data: d.trend.map((t) => t.collectedPaise) }]} formatValue={formatINRCompact} height={220} />
          </div>
        </GlassCard>

        <TableCard className="col-span-12 lg:col-span-5" icon={<UserRound />} title="Needs a person" subtitle="What only someone on the team can move">
          <ul className="border-t border-line py-1.5">
            <WorkRow href={at('/app/folio/collections')} icon={<PhoneCall />} label="Follow-ups due today" value={d.followupsDue} hint="Open and snoozed, due or late, every firm" alert={d.followupsDue > 0} />
            <WorkRow href={at('/app/folio/invoices', { status: 'draft' })} icon={<FileText />} label="Drafts to issue" value={d.draftCount} hint="A draft carries no number until issued" alert={d.draftCount > 0} />
            <WorkRow href="/app/folio/recurring" icon={<Repeat />} label="Retainers to bill" value={d.retainersToBill} hint="Missed periods catch up, none are lost" alert={d.retainersToBill > 0} />
            <WorkRow href={ctx.can('folio.reports') ? at('/app/folio/reports', { report: 'collections' }) : undefined} icon={<CalendarDays />} label="DSO · last 90 days" value={d.dsoDays === null ? '—' : `${d.dsoDays} days`} hint={`Outstanding against billing since ${formatDate(addDays(d.today, -90), { short: true })}`} />
          </ul>
        </TableCard>

        <TableCard
          className="col-span-12 lg:col-span-7"
          icon={<AlarmClock />}
          title="Top debtors"
          subtitle={`Overdue, ${asOf}`}
          actions={
            <Link href="/app/folio/ledger?overdue=1" className="text-xs font-medium text-white transition-opacity hover:opacity-75">
              View all ledgers
            </Link>
          }
        >
          {d.topDebtors.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th icon={<Building2 />}>Client</Th>
                    <Th icon={<CalendarDays />}>Late since</Th>
                    <Th icon={<IndianRupee />} align="right">Owed</Th>
                    <Th icon={<AlarmClock />} align="right">Overdue</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr aria-hidden className="h-1.5" />
                  {d.topDebtors.map((t) => (
                    <tr key={t.clientId} className={cn('relative', TBODY_ROW)}>
                      <Td>
                        <Link href={`/app/folio/ledger/${t.clientId}`} className="block max-w-[260px] truncate text-white after:absolute after:inset-0 after:content-['']">
                          {t.clientName}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-[#979797]">{formatDate(t.oldestDueDate, { short: true })}</Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums text-white/80">{formatINRCompact(t.outstandingPaise)}</Td>
                      <Td align="right" className="whitespace-nowrap font-medium tabular-nums text-[#FF6A66]">{formatINRCompact(t.overduePaise)}</Td>
                    </tr>
                  ))}
                  <tr aria-hidden className="h-2" />
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line px-[23px] py-8 text-center">
              <p className="text-sm text-white">Nobody is overdue.</p>
              <p className="mt-1 text-[13px] text-fg-2">Every open invoice is still within its terms.</p>
            </div>
          )}
        </TableCard>

        <ForecastCard ctx={ctx} firm={firm} />
        {ctx.can('folio.reports') ? (
          <PnlCard ctx={ctx} firm={firm} period={period} today={today} />
        ) : ctx.can('expenses.read') ? (
          <SolidCard className="col-span-12">
            <PanelHeader icon={<Wallet />} title="Expenses" subtitle="Rent, software, travel and vendor payments, by firm and category." actions={<Button size="sm" variant="secondary" href={at('/app/folio/expenses')}>Open expenses</Button>} />
          </SolidCard>
        ) : null}
      </div>
    </div>
  )
}
