import { CalendarDays, FolderKanban, SquareCheckBig, Timer } from 'lucide-react'
import { RingChart } from '@/components/charts/ring-chart'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge, PriorityLabel, StatusPill } from '@/components/ui/badge'
import { Swatch } from '@/components/ui/swatch'
import { cn } from '@/lib/utils'
import { MockFrame, MockPill } from '../mock-frame'

const ACCENT = 'var(--work)'

type MockTask = { key: string; title: string; priority: 'low' | 'medium' | 'high' | 'urgent'; due: string; people: string[]; overdue?: boolean }

const BOARD: { id: string; title: string; tasks: MockTask[] }[] = [
  { id: 'todo', title: 'To do', tasks: [
    { key: 'FB-48', title: 'Homepage copy for Kalpa Studio', priority: 'medium', due: '6 Oct', people: ['Kavya Nair'] },
    { key: 'FB-51', title: 'Collect logo files from client', priority: 'low', due: '9 Oct', people: ['Rohan Mehta'] },
  ] },
  { id: 'in_progress', title: 'In progress', tasks: [
    { key: 'FB-42', title: 'Checkout flow wireframes', priority: 'high', due: '2 Oct', people: ['Aditi Singh', 'Arjun Rao'] },
    { key: 'FB-45', title: 'Sprint 14 planning notes', priority: 'medium', due: '30 Sep', people: ['Priya Sharma'], overdue: true },
  ] },
  { id: 'in_review', title: 'In review', tasks: [
    { key: 'FB-39', title: 'Pricing page QA on mobile', priority: 'urgent', due: 'Today', people: ['Vikram Joshi', 'Aditi Singh'] },
  ] },
  { id: 'done', title: 'Done', tasks: [
    { key: 'FB-36', title: 'Brand colour tokens', priority: 'medium', due: '28 Sep', people: ['Kavya Nair'] },
  ] },
]

function TaskCard({ task }: { task: MockTask }) {
  return (
    <div className="rounded-[10px] bg-[#232323] ring-1 ring-inset ring-white/[0.05] p-3">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-fg-3">
        <span className="whitespace-nowrap">{task.key}</span>
        <PriorityLabel priority={task.priority} />
      </div>
      <p className="mt-1.5 text-[12px] font-medium leading-snug text-fg">{task.title}</p>
      <div className="mt-2.5 flex items-center justify-between">
        <span className={cn('inline-flex items-center gap-1 text-[10px]', task.overdue ? 'text-[#FF2D31]' : 'text-[#979797]')}>
          <CalendarDays className="size-3" aria-hidden /> {task.due}
        </span>
        <AvatarStack people={task.people.map((name) => ({ name }))} size="xs" max={2} />
      </div>
    </div>
  )
}

/** Tasks board: the five-status kanban with keys, priorities, due dates and assignees. */
export function WorkBoardMock() {
  return (
    <MockFrame label="Preview of the Flowbit Work task board" path="/app/work/tasks?view=board" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><SquareCheckBig className="size-3.5" strokeWidth={1.5} aria-hidden /> Tasks</span>
        <span className="flex gap-0.5 rounded-full bg-control p-1 text-[11px]">
          <span className="rounded-full px-2.5 py-1 text-white">List</span>
          <span className="rounded-full bg-control-active px-2.5 py-1 text-white">Board</span>
          <span className="rounded-full px-2.5 py-1 text-white">Calendar</span>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BOARD.map((col) => (
          <div key={col.id} className="min-w-0 rounded-[10px] bg-white/[0.025] p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-fg-2">
              {col.title}
              <span className="ml-auto text-fg-3">{col.tasks.length}</span>
            </div>
            <div className="grid gap-2">
              {col.tasks.map((t) => <TaskCard key={t.key} task={t} />)}
            </div>
          </div>
        ))}
      </div>
    </MockFrame>
  )
}

/** Project overview: ring chart, legend, status, health, members and timeline. */
export function WorkProjectMock() {
  const rings = [
    { label: 'Project done', value: 62, color: 'var(--orange)' },
    { label: 'In progress', value: 28, color: 'var(--info)' },
    { label: 'Blocked', value: 10, color: 'var(--pink)' },
  ]
  return (
    <MockFrame label="Preview of a Flowbit Work project overview" path="/app/work/projects/kalpa-website" accent={ACCENT}>
      <div className="flex items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><FolderKanban className="size-3.5" strokeWidth={1.5} aria-hidden /> Project overview</span>
        <MockPill>Kalpa Studio website</MockPill>
      </div>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <RingChart rings={rings} size={170} thickness={11} centerValue="48" centerLabel="tasks" />
        <div className="w-full min-w-0 flex-1 space-y-3">
          {rings.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-fg-2"><Swatch color={r.color} /> {r.label}</span>
              <span className="font-semibold text-fg">{r.value}%</span>
            </div>
          ))}
          <div className="h-px bg-line-soft/60" />
          <div className="flex items-center justify-between text-xs"><span className="text-fg-3">Status</span><StatusPill status="active" /></div>
          <div className="flex items-center justify-between text-xs"><span className="text-fg-3">Health</span><StatusPill status="at_risk" label="At risk · 2 overdue" /></div>
          <div className="flex items-center justify-between text-xs"><span className="text-fg-3">Team</span><AvatarStack people={[{ name: 'Aditi Singh' }, { name: 'Arjun Rao' }, { name: 'Kavya Nair' }, { name: 'Rohan Mehta' }, { name: 'Priya Sharma' }]} size="xs" max={4} /></div>
          <div className="flex items-center justify-between text-xs"><span className="text-fg-3">Timeline</span><span className="text-fg-2">15 Sep – 31 Oct 2026</span></div>
        </div>
      </div>
    </MockFrame>
  )
}

const WEEK = ['Mon 28', 'Tue 29', 'Wed 30', 'Thu 1', 'Fri 2']
const ROWS = [
  { project: 'Kalpa Studio website', hours: [3.5, 4, 2, 5, 3] },
  { project: 'Ananta Foods retainer', hours: [2, 1.5, 3, 1, 2.5] },
  { project: 'Internal: hiring', hours: [1, 0, 1.5, 0.5, 0] },
]

/** Weekly timesheet: hours by project and day, totals, submit for approval. */
export function WorkTimesheetMock() {
  const dayTotals = WEEK.map((_, i) => ROWS.reduce((s, r) => s + r.hours[i], 0))
  const total = dayTotals.reduce((s, h) => s + h, 0)
  return (
    <MockFrame label="Preview of a weekly timesheet in Flowbit Work" path="/app/work/time" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><Timer className="size-3.5" strokeWidth={1.5} aria-hidden /> This week</span>
        <span className="flex items-center gap-2"><Badge tone="warning">Draft</Badge><MockPill primary>Submit week</MockPill></span>
      </div>
      <div className="mt-4 overflow-hidden rounded-[10px] bg-[#232323]">
        <div className="grid grid-cols-[1.6fr_repeat(5,1fr)_0.8fr] border-b border-line/70 px-3 py-2 text-[10px] text-white">
          <span>Project</span>
          {WEEK.map((d) => <span key={d} className="text-center">{d}</span>)}
          <span className="text-right">Total</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.project} className="grid grid-cols-[1.6fr_repeat(5,1fr)_0.8fr] items-center border-t border-white/[0.04] px-3 py-2.5 text-[11px]">
            <span className="truncate text-fg-2">{r.project}</span>
            {r.hours.map((h, i) => <span key={i} className={cn('text-center', h ? 'text-fg' : 'text-fg-3')}>{h ? `${h}h` : '–'}</span>)}
            <span className="text-right font-semibold text-fg">{r.hours.reduce((s, h) => s + h, 0)}h</span>
          </div>
        ))}
        <div className="grid grid-cols-[1.6fr_repeat(5,1fr)_0.8fr] border-t border-line/70 px-3 py-2.5 text-[11px] font-semibold">
          <span className="text-fg-2">Total</span>
          {dayTotals.map((h, i) => <span key={i} className="text-center text-fg">{h}h</span>)}
          <span className="text-right text-white">{total}h</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-fg-3">Approver: Vikram Joshi (manager)</p>
    </MockFrame>
  )
}
