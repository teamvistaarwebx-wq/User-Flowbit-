import type { Metadata } from 'next'
import { PRODUCT_DESCRIPTOR } from '@/lib/catalog'
import { after } from 'next/server'
import Link from 'next/link'
import { AlarmClock, Building2, CalendarCheck, CalendarPlus, Clock, Ghost, IndianRupee, NotebookPen, Orbit, Plus, Target, Trophy, Upload, Waypoints } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { formatINR, formatINRCompact } from '@/lib/money'
import { first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { ActivityList } from '@/components/orbit/activity-row'
import { ImportLeadsDialog } from '@/components/orbit/import-leads-dialog'
import { LogActivityDialog } from '@/components/orbit/log-activity-dialog'
import { MonthTarget } from '@/components/orbit/month-target'
import { Note, PanelHeader, SolidCard, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from '@/components/orbit/parts'
import { PipelineBar } from '@/components/orbit/pipeline-bar'
import { QuickAddLead } from '@/components/orbit/quick-add-lead'
import { ConversionOverview } from '@/components/orbit/report-cards'
import { ScheduleDialog } from '@/components/orbit/schedule-dialog'
import { LeadStageBadge } from '@/components/orbit/stage-badge'
import { UrlSelect } from '@/components/orbit/url-select'
import { loadChoices } from '@/modules/orbit/choices'
import type { LeadStage } from '@/modules/orbit/constants'
import { dashboard } from '@/modules/orbit/dashboard.queries'
import { dailyTarget, targetSub } from '@/modules/orbit/metrics'
import { peopleIndex } from '@/modules/orbit/people'
import { remindDueFollowUps } from '@/modules/orbit/reminders'
import { resolveOwner } from '@/modules/orbit/scope'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Orbit' }

/** "Won this month" as a stat card grown up: transparent glass, the teal corner wash, the figure large. */
function WonCard({ valuePaise, count, delta, recent }: { valuePaise: number; count: number; delta: number | null; recent: { id: string; title: string; client: string; valuePaise: number }[] }) {
  return (
    <section className="glass relative flex min-w-0 flex-col overflow-hidden rounded-[10px] bg-white/[0.015] px-[15px] pb-4 pt-[17px]">
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: 'radial-gradient(60% 70% at 100% 100%, color-mix(in srgb, var(--success) 34%, transparent) 0%, transparent 72%)' }} />
      <div className="relative flex flex-1 flex-col">
        <PanelHeader icon={<Trophy />} title="Won this month" actions={delta !== null ? <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium tabular-nums text-white', delta >= 0 ? 'bg-[#08AD93]' : 'bg-[#E9403B]')} title="Against last month">{delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta)}%</span> : null} />
        <p className="mt-4 text-[40px] font-semibold leading-[44px] tracking-[-0.01em] tabular-nums text-white">{formatINR(valuePaise, { decimals: 0 })}</p>
        <p className="mt-1 text-[13px] text-[#959596]">{count} {count === 1 ? 'deal' : 'deals'} closed won</p>
        <ul className="mt-auto space-y-px pt-5">
          {recent.map((w) => (
            <li key={w.id}>
              <Link href={`/app/orbit/deals/${w.id}`} className="-mx-2 flex h-8 items-center justify-between gap-3 rounded-[8px] px-2 text-sm transition-colors hover:bg-white/[0.05]">
                <span className="min-w-0 truncate text-white">
                  {w.title}
                  {w.client ? <span className="ml-2 text-[13px] text-[#979797]">{w.client}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-[#2DCBAF]">{formatINRCompact(w.valuePaise)}</span>
              </Link>
            </li>
          ))}
          {recent.length === 0 ? <li className="text-[13px] text-fg-2">No wins yet this month.</li> : null}
        </ul>
      </div>
    </section>
  )
}

export default async function OrbitDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const owner = resolveOwner(ctx, first(sp.owner))
  after(() => remindDueFollowUps(ctx))
  const { cfg, people, choices } = await loadChoices(ctx)
  const d = await dashboard(ctx, owner, cfg, peopleIndex(people))
  const workDays = ctx.org.workWeek?.length || 6
  const leadTarget = dailyTarget(cfg.targets.weeklyNewLeads, workDays)
  const outreachTarget = dailyTarget(cfg.targets.weeklyOutreach, workDays)
  const canLead = ctx.can('leads.write')
  const canAct = ctx.can('activities.write')
  const newLead = canLead ? <QuickAddLead choices={choices} canAssign={ctx.can('orbit.close')} defaultReviewerId={cfg.defaultReviewerId} today={d.today} trigger={<Button variant="primary" icon={<Plus className="size-4" />}>New lead</Button>} /> : null
  const empty = d.noNext.openLeads === 0 && d.openDeals === 0 && d.pipeline.openPaise === 0
  const t = cfg.targets
  const meetingsLeft = Math.max(0, t.monthlyMeetings - d.counters.monthMeetings)

  return (
    <>
      <PageHeader
        title="Orbit"
        description={`${PRODUCT_DESCRIPTOR.orbit} today · ${formatDate(d.today, { withWeekday: true })}`}
        icon={<Orbit />}
        actions={
          <>
            {ctx.can('orbit.view_all') ? <UrlSelect param="owner" label="Scope" allLabel="Whole team" options={[{ value: 'me', label: 'My pipeline' }, ...people.filter((p) => p.canWrite).map((p) => ({ value: p.id, label: p.name }))]} /> : null}
            {canAct ? <LogActivityDialog today={d.today} trigger={<Button variant="secondary" icon={<NotebookPen className="size-4" />}>Log activity</Button>} /> : null}
            {newLead}
          </>
        }
      />

      <div className="@container flex flex-col gap-3">
        {empty ? (
          <Card variant="solid" className="rounded-[10px]">
            <EmptyState
              icon={<Target />}
              title="Your pipeline is empty"
              description={`Add your first lead. Sourcing ${leadTarget} a day gets you to the weekly target.`}
              action={<div className="flex flex-wrap justify-center gap-2">{newLead}{canLead ? <ImportLeadsDialog choices={choices} canAssign={ctx.can('orbit.close')} trigger={<Button variant="secondary" icon={<Upload className="size-4" />}>Import CSV</Button>} /> : null}</div>}
            />
          </Card>
        ) : null}

        <MonthTarget
          booked={d.counters.monthMeetings}
          target={t.monthlyMeetings}
          caption="Meetings booked this month, the number that closes"
          aside={meetingsLeft > 0 ? `${meetingsLeft} to go. ${leadTarget} new leads and ${outreachTarget} outreach a day keep you on pace.` : 'Target met. Keep the follow-ups moving.'}
        />

        <div className="grid grid-cols-2 gap-3 @min-[900px]:grid-cols-4">
          <StatCard label="Leads added" value={d.counters.today.added} trend={d.counters.added.counts} color="var(--info)" hint={targetSub(d.counters.today.added, leadTarget)} href="/app/orbit/leads?sort=created" />
          <StatCard label="Outreach sent" value={d.counters.today.outreach} trend={d.counters.outreach.counts} color="#8E8DFF" hint={targetSub(d.counters.today.outreach, outreachTarget)} />
          <StatCard label="Replies in" value={d.counters.today.replies} trend={d.counters.replies.counts} color="var(--orange)" hint="Unlocks Engaged" />
          <StatCard label="Meetings booked" value={d.counters.today.booked} trend={d.counters.booked.counts} color="var(--success)" hint={d.counters.today.booked > 0 ? 'Good day.' : `${d.counters.monthMeetings} of ${t.monthlyMeetings} this month`} />
        </div>

        <div className="grid gap-3 @min-[1000px]:grid-cols-[743fr_532.5fr] @min-[1000px]:gap-[14.5px]">
          <ConversionOverview
            title="Conversion · 30 days"
            icon={<Waypoints />}
            cold={{ value: d.conversion.cold, numerator: d.conversion.meetingsBooked, denominator: d.conversion.contacted, target: t.coldMinPct, targetLabel: `${t.coldMinPct}–${t.coldMaxPct}%` }}
            warm={{ value: d.conversion.warm, numerator: d.conversion.meetingsBooked, denominator: d.conversion.engaged, target: t.warmPct, targetLabel: `${t.warmPct}%` }}
            meetings={d.conversion.meetingsBooked}
            action={ctx.can('orbit.reports') ? <Link href="/app/orbit/reports" className="text-xs font-medium text-white transition-opacity hover:opacity-75">Open reports</Link> : undefined}
          />
          <WonCard valuePaise={d.won.valuePaise} count={d.won.count} delta={d.won.delta} recent={d.won.recent} />
        </div>

        <SolidCard className="mt-2">
          <PanelHeader
            icon={<IndianRupee />}
            title="Pipeline value"
            subtitle={`Open ${formatINR(d.pipeline.openPaise, { decimals: 0 })} · weighted ${formatINR(d.pipeline.weightedPaise, { decimals: 0 })}`}
            actions={<Link href="/app/orbit/deals" className="text-xs font-medium text-white transition-opacity hover:opacity-75">View all deals</Link>}
            className="mb-5"
          />
          {d.pipeline.openPaise === 0 ? (
            <p className="pb-2 text-[13px] text-fg-2">No open deals yet. Convert a lead at Meeting done, or create a deal for a client.</p>
          ) : (
            <PipelineBar stages={d.pipeline.stages} />
          )}
        </SolidCard>

        <div className="mt-2 grid gap-3 @min-[1000px]:grid-cols-2 @min-[1000px]:gap-[15px]">
          <TableCard icon={<AlarmClock />} title={`Overdue · ${d.followUps.overdue.length}`} subtitle="Follow-ups past their date" actions={<Link href="/app/orbit/activities?tab=overdue" className="text-xs font-medium text-white transition-opacity hover:opacity-75">View all</Link>}>
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={d.followUps.overdue} today={d.today} canAct={canAct} empty="Nothing overdue. Clean slate." />
            </div>
          </TableCard>
          <TableCard icon={<CalendarCheck />} title={`Due today · ${d.followUps.dueToday.length}`} subtitle="What to get through before you log off" actions={<Link href="/app/orbit/activities" className="text-xs font-medium text-white transition-opacity hover:opacity-75">View all</Link>}>
            <div className="border-t border-line px-[11px] py-2">
              <ActivityList items={d.followUps.dueToday} today={d.today} canAct={canAct} empty="Nothing due today." />
            </div>
          </TableCard>
        </div>

        <TableCard
          className="mt-2"
          icon={<Ghost />}
          title={`No next step · ${d.noNext.total}`}
          subtitle="Open leads with no scheduled follow-up. These are the ones that quietly die."
          actions={d.noNext.total > d.noNext.leads.length ? <Link href="/app/orbit/leads?due=none" className="text-xs font-medium text-white transition-opacity hover:opacity-75">See all {d.noNext.total}</Link> : null}
        >
          {d.noNext.ghosts > 0 ? (
            <Note tone="warning" className="mx-[23px] mb-4">
              {d.noNext.ghosts} {d.noNext.ghosts === 1 ? "lead hasn't" : "leads haven't"} been touched in over {cfg.staleDays} days and {d.noNext.ghosts === 1 ? 'has' : 'have'} no follow-up date. Schedule a next action or disqualify them; a pipeline full of ghosts makes the conversion numbers meaningless.
            </Note>
          ) : null}
          {d.noNext.leads.length === 0 ? (
            <p className="border-t border-line px-[23px] py-8 text-center text-[13px] text-fg-2">Every open lead has a next step. Well run.</p>
          ) : (
            <div className="overflow-x-auto pb-3">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th icon={<Building2 strokeWidth={1.5} />}>Company</Th>
                    <Th>Stage</Th>
                    <Th icon={<Clock strokeWidth={1.5} />}>Last touch</Th>
                    <Th align="right" />
                  </tr>
                </thead>
                <tbody>
                  <tr aria-hidden className="h-1.5" />
                  {d.noNext.leads.map((l) => (
                    <tr key={l.id} className={cn(TBODY_ROW, 'h-10')}>
                      <Td>
                        <Link href={`/app/orbit/leads/${l.id}`} className="truncate text-white transition-colors hover:text-blush">{l.companyName}</Link>
                      </Td>
                      <Td><LeadStageBadge stage={l.stage as LeadStage} /></Td>
                      <Td><span className={l.stale ? 'text-[#FF2D31]' : 'text-[#979797]'}>{l.stale ? `Untouched ${l.days}d` : `${l.days}d ago`}</span></Td>
                      <Td align="right">{canAct && l.canEdit ? <ScheduleDialog related={{ leadId: l.id }} today={d.today} trigger={<Button size="sm" variant="ghost" icon={<CalendarPlus className="size-4" />}>Schedule</Button>} /> : null}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TableCard>
      </div>
    </>
  )
}
