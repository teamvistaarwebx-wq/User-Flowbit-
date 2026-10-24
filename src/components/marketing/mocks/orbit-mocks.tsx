import { Activity, ChartLine, Kanban, Mail, MessageCircle, Phone, Video } from 'lucide-react'
import { BarChart } from '@/components/charts/bar-chart'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MockFrame, MockPill } from '../mock-frame'

const ACCENT = 'var(--orbit)'

type MockDeal = { title: string; client: string; valuePaise: number; owner: string; probability: number }

const STAGES: { id: string; title: string; deals: MockDeal[] }[] = [
  { id: 'qualified', title: 'Qualified', deals: [
    { title: 'Brand refresh', client: 'Ananta Foods', valuePaise: 18_000_000, owner: 'Rohan Mehta', probability: 30 },
    { title: 'Store rollout site', client: 'Kiran Home', valuePaise: 9_500_000, owner: 'Arjun Rao', probability: 25 },
  ] },
  { id: 'proposal', title: 'Proposal sent', deals: [
    { title: 'D2C storefront', client: 'Saffron Threads', valuePaise: 42_000_000, owner: 'Rohan Mehta', probability: 60 },
  ] },
  { id: 'negotiation', title: 'Negotiation', deals: [
    { title: 'Annual retainer', client: 'Kalpa Studio', valuePaise: 72_000_000, owner: 'Priya Sharma', probability: 80 },
  ] },
  { id: 'won', title: 'Won', deals: [
    { title: 'Lead-gen landing pages', client: 'Nirmal Realty', valuePaise: 24_000_000, owner: 'Arjun Rao', probability: 100 },
  ] },
]

/** Deal pipeline: kanban by stage with values, totals, owners and probability. */
export function OrbitPipelineMock() {
  return (
    <MockFrame label="Preview of the Orbit deal pipeline" path="/app/orbit/deals" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><Kanban className="size-3.5" strokeWidth={1.5} aria-hidden /> Deals</span>
        <span className="text-[11px] text-fg-3">Open pipeline <span className="font-semibold text-fg">{formatINRCompact(141_500_000)}</span></span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const total = stage.deals.reduce((s, d) => s + d.valuePaise, 0)
          return (
            <div key={stage.id} className="min-w-0 rounded-[10px] bg-white/[0.025] p-2">
              <div className="mb-2 px-1">
                <p className="flex items-center justify-between text-[11px] font-semibold text-fg-2">{stage.title}<span className="text-fg-3">{stage.deals.length}</span></p>
                <p className="text-[10px] text-orbit">{formatINRCompact(total)}</p>
              </div>
              <div className="grid gap-2">
                {stage.deals.map((d) => (
                  <div key={d.title} className={cn('rounded-[10px] bg-[#232323] p-3 ring-1 ring-inset', stage.id === 'won' ? 'ring-success/40' : 'ring-white/[0.05]')}>
                    <p className="text-[12px] font-medium leading-snug text-fg">{d.title}</p>
                    <p className="text-[10px] text-fg-3">{d.client}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-fg">{formatINRCompact(d.valuePaise)}</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-fg-3">{d.probability}%<Avatar name={d.owner} size="xs" /></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </MockFrame>
  )
}

const TIMELINE = [
  { icon: Video, tone: 'text-orbit', title: 'Meeting done', body: 'Walked through the storefront scope with Neha', at: 'Today, 11:30 am' },
  { icon: MessageCircle, tone: 'text-success', title: 'Reply received', body: 'Neha asked for a call this week', at: '28 Sep, 4:10 pm' },
  { icon: Mail, tone: 'text-violet', title: 'Email sent', body: 'Intro and two case studies', at: '25 Sep, 10:05 am' },
  { icon: Phone, tone: 'text-fg-2', title: 'Call, no answer', body: 'Left a message with the front desk', at: '23 Sep, 3:40 pm' },
]
const LEAD_STAGES = ['New', 'Contacted', 'Engaged', 'Meeting booked', 'Meeting done', 'Proposal sent']

/** Lead detail: stage rail, next action and the activity timeline. */
export function OrbitLeadMock() {
  const current = 4
  return (
    <MockFrame label="Preview of an Orbit lead timeline" path="/app/orbit/leads/saffron-threads" accent={ACCENT}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-fg">Saffron Threads</p>
          <p className="text-[11px] text-fg-3">Neha Kapoor · Instagram · D2C</p>
        </div>
        <MockPill primary>Move to Proposal sent</MockPill>
      </div>
      <div className="mt-4 grid grid-cols-6 gap-0">
        {LEAD_STAGES.map((s, i) => (
          <div key={s} className="min-w-0">
            <div className={cn('h-4 rounded-full', i < current ? 'bg-orbit' : i === current ? 'bg-orbit/60' : 'bg-white/[0.1]')} />
            <p className={cn('mt-1.5 truncate text-[9px]', i <= current ? 'text-fg-2' : 'text-fg-3')}>{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-[10px] bg-white/[0.04] px-3 py-2 text-[11px]">
        <span className="text-warning">Next: send the proposal</span>
        <span className="text-fg-2">Due 3 Oct</span>
      </div>
      <ol className="mt-4 grid gap-3">
        {TIMELINE.map((t) => (
          <li key={t.title} className="flex gap-3">
            <t.icon className={cn('mt-0.5 size-4 shrink-0', t.tone)} strokeWidth={1.5} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-fg">{t.title}</span>
              <span className="block text-[11px] text-fg-2">{t.body}</span>
              <span className="block text-[10px] text-fg-3">{t.at}</span>
            </span>
          </li>
        ))}
      </ol>
    </MockFrame>
  )
}

/** Reports: cold vs warm conversion and conversion by source. */
export function OrbitReportsMock() {
  return (
    <MockFrame label="Preview of Orbit conversion reports" path="/app/orbit/reports" accent={ACCENT}>
      <span className="section-label flex items-center gap-2"><ChartLine className="size-3.5" strokeWidth={1.5} aria-hidden /> Conversion · September 2026</span>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="glass p-4">
          <p className="section-label">Cold</p>
          <p className="mt-2 text-2xl font-semibold text-fg">12%</p>
          <p className="text-[10px] text-fg-3">9 meetings ÷ 75 contacted</p>
        </div>
        <div className="glass p-4">
          <p className="section-label">Warm</p>
          <p className="mt-2 text-2xl font-semibold text-fg">41%</p>
          <p className="text-[10px] text-fg-3">9 meetings ÷ 22 replied</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 flex items-center gap-2 text-[11px] text-fg-2"><Activity className="size-3.5" aria-hidden /> Meetings booked by source</p>
        <BarChart
          labels={['Instagram', 'LinkedIn', 'Referral', 'Inbound', 'Event']}
          series={[{ name: 'Contacted', color: 'rgba(96,165,250,0.35)', data: [28, 22, 6, 12, 7] }, { name: 'Meetings', color: 'var(--orbit)', data: [3, 2, 2, 1, 1] }]}
          height={150}
        />
      </div>
      <div className="mt-2 flex gap-2"><Badge tone="info">Contacted</Badge><Badge tone="success">Meetings</Badge></div>
    </MockFrame>
  )
}
