import type { Metadata } from 'next'
import Link from 'next/link'
import { Activity, ChartLine, Clock, Filter, Gauge, Handshake, Layers, ShoppingBag, Target, Trophy, Users, Waypoints } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { DateInput } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { BarChart } from '@/components/charts/bar-chart'
import { Note, PanelHeader, SegmentLinks, SolidCard } from '@/components/orbit/parts'
import { PipelineBar } from '@/components/orbit/pipeline-bar'
import { ConversionOverview, FunnelBars, Tile } from '@/components/orbit/report-cards'
import { ReportTable } from '@/components/orbit/report-table'
import { UrlSelect } from '@/components/orbit/url-select'
import { LEAD_STAGE_LABEL, STAGE_COLORS, labelFrom } from '@/modules/orbit/constants'
import { SMALL_SAMPLE, formatPct, funnel, pct1 } from '@/modules/orbit/metrics'
import { nameOf, orbitPeople, peopleIndex } from '@/modules/orbit/people'
import { reportData } from '@/modules/orbit/reports.queries'
import { resolveOwner } from '@/modules/orbit/scope'
import { getOrbitSettings } from '@/modules/orbit/settings'
import { RANGE_LABEL, REPORT_RANGES, istRange, resolveRange } from '@/modules/orbit/time-ranges'

export const metadata: Metadata = { title: 'Orbit reports' }
const BASE = '/app/orbit/reports'

export default async function OrbitReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.reports' })
  const r = resolveRange(first(sp.range), first(sp.from), first(sp.to))
  const owner = resolveOwner(ctx, first(sp.owner))
  const sector = first(sp.sector) || null
  const [cfg, people] = await Promise.all([getOrbitSettings(ctx), orbitPeople(ctx)])
  const index = peopleIndex(people)
  const data = await reportData(ctx, { owner, sector, range: istRange(r.from, r.to), showOwners: ctx.can('orbit.view_all') }, cfg)
  const f = funnel(data.funnel)
  const t = cfg.targets
  const csv = (name: string) => `orbit-${name}-${r.from}-to-${r.to}.csv`
  const pctCell = (v: number | null) => formatPct(v)
  const rangeLink = (key: string) => buildHref(BASE, sp, { range: key === '30d' ? undefined : key, from: undefined, to: undefined })

  return (
    <>
      <PageHeader title="Orbit reports" description={`Leads created ${formatDate(r.from)} – ${formatDate(r.to)}. Pipeline numbers follow the lead owner; effort numbers follow who logged the activity.`} breadcrumb={breadcrumbFor(BASE)} icon={<ChartLine />}>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentLinks label="Range" items={REPORT_RANGES.filter((k) => k !== 'custom').map((k) => ({ href: rangeLink(k), label: RANGE_LABEL[k], active: r.range === k }))} />
          <form action={BASE} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="range" value="custom" />
            {first(sp.owner) ? <input type="hidden" name="owner" value={first(sp.owner)} /> : null}
            {sector ? <input type="hidden" name="sector" value={sector} /> : null}
            <DateInput name="from" defaultValue={r.from} inputSize="sm" aria-label="From" className="w-[140px]" />
            <DateInput name="to" defaultValue={r.to} inputSize="sm" aria-label="To" className="w-[140px]" />
            <button type="submit" className={cn(buttonClass(r.range === 'custom' ? 'violet' : 'secondary', 'sm'))}>Apply</button>
          </form>
          <span className="flex-1" />
          <UrlSelect param="sector" label="Sector" allLabel="All sectors" options={cfg.sectors.map((s) => ({ value: s.key, label: s.label }))} />
          {ctx.can('orbit.view_all') ? <UrlSelect param="owner" label="Owner" allLabel="Whole team" options={[{ value: 'me', label: 'Me' }, ...people.filter((p) => p.canWrite).map((p) => ({ value: p.id, label: p.name }))]} /> : null}
        </div>
      </PageHeader>

      <div className="@container grid grid-cols-12 gap-3 xl:gap-[15px]">
        <div className="col-span-12 grid gap-3 @min-[1000px]:grid-cols-[743fr_532.5fr] @min-[1000px]:gap-[14.5px]">
          <ConversionOverview
            title="Conversion"
            icon={<Waypoints />}
            cold={{ value: f.cold, numerator: f.meetingsBooked, denominator: f.contacted, target: t.coldMinPct, targetLabel: `${t.coldMinPct}–${t.coldMaxPct}%` }}
            warm={{ value: f.warm, numerator: f.meetingsBooked, denominator: f.engaged, target: t.warmPct, targetLabel: `${t.warmPct}%` }}
            meetings={f.meetingsBooked}
            note={data.maturing ? `${data.maturing} of these leads were contacted in the last 14 days and may still convert.` : undefined}
          />
          <SolidCard>
            <PanelHeader icon={<Activity />} title="Outreach volume · 14 days" subtitle="Flat days here explain flat months there." className="mb-4" />
            <BarChart
              stacked
              height={200}
              labels={data.volume.days.map((d, i) => (i === data.volume.days.length - 1 ? 'Today' : String(Number(d.slice(8, 10)))))}
              series={[{ name: 'Outreach', color: 'var(--info)', data: data.volume.outreach }, { name: 'Replies', color: 'var(--orange)', data: data.volume.replies }]}
            />
            <p className="mt-auto pt-3 text-xs text-[#979797]">Days of the month, {formatDate(data.volume.days[0], { short: true })} to today. Meetings held: {data.volume.meetings.reduce((s, n) => s + n, 0)} in 14 days. Sequence emails (not counted as outreach): {data.volume.sequenceEmails.reduce((s, n) => s + n, 0)}.</p>
          </SolidCard>
        </div>
        <Note className="col-span-12">One rate cannot describe both cold outreach and warm conversations. Cold % is measured against everyone contacted, warm % against everyone who actually replied.</Note>
        {f.contacted < SMALL_SAMPLE ? (
          <Note tone="warning" className="col-span-12">Only {f.contacted} leads contacted so far. Below roughly {SMALL_SAMPLE}, these percentages swing on a single meeting. Read them as direction, not as performance.</Note>
        ) : null}

        <SolidCard className="col-span-12 mt-2">
          <PanelHeader icon={<Filter />} title="Funnel" subtitle="Counts every lead that ever reached a stage, not what is sitting there now." className="mb-5" />
          {f.total === 0 ? <p className="mb-4 text-[13px] text-fg-2">No leads in this period. Try a longer range.</p> : null}
          <div className="grid gap-6 @min-[1000px]:grid-cols-[minmax(0,1fr)_320px]">
            <FunnelBars
              total={f.total}
              steps={[
                { label: 'Leads added', value: f.total },
                { label: 'Contacted', value: f.contacted, sub: formatPct(f.contactRate) },
                { label: 'Engaged', value: f.engaged, sub: `reply ${formatPct(f.replyRate)}` },
                { label: 'Meeting booked', value: f.meetingsBooked },
                { label: 'Meeting done', value: f.meetingsDone },
                { label: 'Converted', value: f.converted },
                { label: 'Won', value: f.won },
              ]}
            />
            <div className="grid grid-cols-2 content-start gap-3">
              <Tile label="Open" value={f.open} />
              <Tile label="Converted" value={f.converted} tone="success" />
              <Tile label="Lost" value={f.lost} tone="danger" />
              <Tile label="Disqualified" value={f.disqualified} />
            </div>
          </div>
        </SolidCard>

        <ReportTable label="Stage velocity" icon={<Clock />} hint="Average days a lead spends in each stage before its next move." csvName={csv('stage-velocity')} empty="Not enough stage movement yet."
          columns={[{ key: 'stage', header: 'Stage' }, { key: 'avg', header: 'Avg days', align: 'right' }, { key: 'sample', header: 'Sample', align: 'right' }]}
          rows={data.velocity.filter((v) => v.sample > 0).map((v) => ({ id: v.stage, cells: { stage: LEAD_STAGE_LABEL[v.stage], avg: v.avgDays ?? '—', sample: v.sample } }))}
        />
        <ReportTable label="Source performance" icon={<Waypoints />} hint="Volume is not performance. The channel that produces the most leads is often not the one that produces meetings." csvName={csv('sources')}
          columns={[{ key: 'source', header: 'Source' }, { key: 'total', header: 'Leads', align: 'right' }, { key: 'contacted', header: 'Contacted', align: 'right' }, { key: 'engaged', header: 'Replied', align: 'right' }, { key: 'meetings', header: 'Meetings', align: 'right' }, { key: 'converted', header: 'Converted', align: 'right' }, { key: 'won', header: 'Won', align: 'right' }, { key: 'cold', header: 'Cold %', align: 'right' }, { key: 'warm', header: 'Warm %', align: 'right' }]}
          rows={data.sources.map((g) => ({
            id: g.key, tag: cfg.sources.find((s) => s.key === g.key)?.warm ? 'warm' : undefined,
            cells: { source: labelFrom(cfg.sources, g.key), total: g.total, contacted: g.contacted, engaged: g.engaged, meetings: g.meetingsBooked, converted: g.converted, won: g.won, cold: pctCell(g.cold), warm: pctCell(g.warm) },
            highlight: [...(g.cold !== null && g.cold >= t.coldMinPct ? ['cold'] : []), ...(g.warm !== null && g.warm >= t.warmPct ? ['warm'] : [])],
          }))}
        />
        <ReportTable label="Sector split" icon={<ShoppingBag />} hint="If another sector is absorbing effort without producing meetings, this is the evidence to drop it." csvName={csv('sectors')}
          columns={[{ key: 'sector', header: 'Sector' }, { key: 'total', header: 'Leads', align: 'right' }, { key: 'contacted', header: 'Contacted', align: 'right' }, { key: 'engaged', header: 'Replied', align: 'right' }, { key: 'meetings', header: 'Meetings', align: 'right' }, { key: 'won', header: 'Won', align: 'right' }, { key: 'warm', header: 'Warm %', align: 'right' }]}
          rows={data.sectors.map((g) => ({ id: g.key, tag: cfg.sectors.find((s) => s.key === g.key)?.primary ? 'primary' : undefined, cells: { sector: labelFrom(cfg.sectors, g.key), total: g.total, contacted: g.contacted, engaged: g.engaged, meetings: g.meetingsBooked, won: g.won, warm: pctCell(g.warm) } }))}
        />
        {ctx.can('orbit.view_all') ? (
          <ReportTable label="By owner" icon={<Users />} hint="Leads and conversion by lead owner; outreach by who logged it." csvName={csv('owners')}
            columns={[{ key: 'owner', header: 'Owner' }, { key: 'total', header: 'Leads', align: 'right' }, { key: 'contacted', header: 'Contacted', align: 'right' }, { key: 'engaged', header: 'Replied', align: 'right' }, { key: 'meetings', header: 'Meetings', align: 'right' }, { key: 'cold', header: 'Cold %', align: 'right' }, { key: 'warm', header: 'Warm %', align: 'right' }, { key: 'outreach', header: 'Outreach logged', align: 'right' }, { key: 'won', header: 'Deals won', align: 'right' }]}
            rows={data.owners.map((o) => ({ id: o.ownerId, cells: { owner: nameOf(index, o.ownerId), total: o.total, contacted: o.contacted, engaged: o.engaged, meetings: o.meetings, cold: pctCell(o.cold), warm: pctCell(o.warm), outreach: o.outreach, won: o.dealsWon ? `${o.dealsWon} · ${formatINRCompact(o.wonPaise)}` : '0' } }))}
          />
        ) : null}

        <div className="col-span-12 mt-2 grid gap-3 @min-[1000px]:grid-cols-2 @min-[1000px]:gap-[15px]">
          <SolidCard>
            <PanelHeader icon={<Trophy />} title="Deals won and lost" subtitle="Deals closed in this period." className="mb-4" />
            <div className="grid grid-cols-2 gap-3">
              <Tile label={`Won · ${data.deals.won.count}`} value={formatINRCompact(data.deals.won.valuePaise)} tone="success" />
              <Tile label={`Lost · ${data.deals.lost.count}`} value={formatINRCompact(data.deals.lost.valuePaise)} tone="danger" />
              <Tile label="Win rate (count)" value={formatPct(data.deals.winRate)} />
              <Tile label="Win rate (value)" value={formatPct(data.deals.valueWinRate)} />
            </div>
            <ul className="mt-4">
              {data.deals.reach.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 text-sm last:border-0">
                  <span className="text-white">Reached {s.label}</span>
                  <span className="tabular-nums text-white">{s.reached} <span className="text-[13px] text-[#979797]">· {formatPct(s.wonShare)} went on to win</span></span>
                </li>
              ))}
            </ul>
          </SolidCard>
          <SolidCard>
            <PanelHeader icon={<Layers />} title="Pipeline now" subtitle="Open deals today, whatever the range." className="mb-5" />
            {data.pipeline.stages.some((s) => s.valuePaise > 0) ? <PipelineBar stages={data.pipeline.stages.map((s) => ({ ...s, color: STAGE_COLORS[cfg.dealStages.find((d) => d.key === s.key)?.color ?? 'sky'] }))} /> : <p className="text-[13px] text-fg-2">No open deals right now.</p>}
            <p className="mt-auto pt-4 text-[13px] text-fg-2">Expected to close this month: <span className="tabular-nums text-white">{formatINR(data.pipeline.closingThisMonth, { decimals: 0 })}</span></p>
          </SolidCard>
        </div>

        <ReportTable label="Close reasons" icon={<Gauge />} hint="Leads disqualified or lost and deals lost in this period, by reason." csvName={csv('close-reasons')}
          columns={[{ key: 'reason', header: 'Reason' }, { key: 'dq', header: 'Leads disqualified', align: 'right' }, { key: 'lost', header: 'Leads lost', align: 'right' }, { key: 'deals', header: 'Deals lost', align: 'right' }, { key: 'value', header: 'Deals lost ₹', align: 'right' }, { key: 'share', header: 'Share', align: 'right' }]}
          rows={data.reasons.lost.map((x) => ({ id: x.code, cells: { reason: labelFrom(cfg.lostReasons, x.code), dq: x.disqualified, lost: x.leadsLost, deals: x.dealsLost, value: formatINR(x.dealsLostPaise, { decimals: 0 }), share: formatPct(x.share) } }))}
        />
        <ReportTable label="Won reasons" icon={<Handshake />} csvName={csv('won-reasons')}
          columns={[{ key: 'reason', header: 'Reason' }, { key: 'count', header: 'Deals', align: 'right' }, { key: 'value', header: 'Value', align: 'right' }, { key: 'share', header: 'Share', align: 'right' }]}
          rows={data.reasons.won.map((x) => ({ id: x.code, cells: { reason: x.code === 'unspecified' ? 'Not given' : labelFrom(cfg.wonReasons, x.code), count: x.count, value: formatINR(x.valuePaise, { decimals: 0 }), share: formatPct(pct1(x.count, data.deals.won.count)) } }))}
        />
        <p className="col-span-12 flex items-center gap-2 text-[13px] text-fg-2"><Target className="size-4 text-icon-muted" /> Targets are edited in {ctx.can('orbit.settings') ? <Link href="/app/orbit/settings?tab=targets" className="text-link transition-colors hover:text-white">Orbit settings</Link> : 'Orbit settings'}.</p>
      </div>
    </>
  )
}
