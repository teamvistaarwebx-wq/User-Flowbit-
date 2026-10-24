import { Banknote, FileSignature, Fingerprint } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, StatusPill, TONE_DOT } from '@/components/ui/badge'
import { SegmentedBar } from '@/components/ui/progress'
import { Stepper } from '@/components/ui/stepper'
import { formatINR } from '@/lib/money'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { MockFrame, MockPill } from '../mock-frame'

const ACCENT = 'var(--muster)'

type Mark = 'P' | 'L' | 'H' | 'A' | 'V' | 'W'
const MARK_TONE: Record<Mark, Tone> = { P: 'success', L: 'warning', H: 'orange', A: 'danger', V: 'violet', W: 'neutral' }
const LEGEND: { mark: Mark; label: string }[] = [
  { mark: 'P', label: 'Present' }, { mark: 'L', label: 'Late' }, { mark: 'H', label: 'Half day' },
  { mark: 'A', label: 'Absent' }, { mark: 'V', label: 'Leave' }, { mark: 'W', label: 'Week off' },
]
const DAYS = 14
const PEOPLE: { name: string; code: string; row: string }[] = [
  { name: 'Aditi Singh', code: 'VW-0004', row: 'PPLPPPWPPPPHPW' },
  { name: 'Rohan Mehta', code: 'VW-0007', row: 'PPPPVVWPPLPPPW' },
  { name: 'Kavya Nair', code: 'VW-0011', row: 'PLPPPPWPPPAPPW' },
  { name: 'Arjun Rao', code: 'VW-0013', row: 'PPPHPPWPPPPPLW' },
  { name: 'Priya Sharma', code: 'VW-0016', row: 'PPPPPPWVVPPPPW' },
]

/** Attendance register: a fortnight of colour-coded day cells per employee, with the month summary bar. */
export function MusterAttendanceMock() {
  const all = PEOPLE.flatMap((p) => [...p.row]) as Mark[]
  const count = (m: Mark) => all.filter((x) => x === m).length
  return (
    <MockFrame label="Preview of the Muster attendance register" path="/app/hr/attendance" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><Fingerprint className="size-3.5" strokeWidth={1.5} aria-hidden /> Attendance · October 2026</span>
        <span className="flex items-center gap-2"><Badge tone="success">Open</Badge><MockPill>Lock month</MockPill></span>
      </div>
      <SegmentedBar className="mt-4" segments={[{ label: 'On time', value: count('P'), tone: 'success' }, { label: 'Late', value: count('L') + count('H'), tone: 'warning' }, { label: 'Absent', value: count('A'), tone: 'danger' }]} />
      <div className="mt-4 overflow-hidden rounded-[10px] bg-[#232323]">
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,3fr)] items-center gap-3 border-b border-line/70 px-3 py-2 text-[10px] text-white">
          <span>Employee</span>
          <span className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1 text-center">
            {Array.from({ length: DAYS }, (_, i) => <span key={i}>{i + 1}</span>)}
          </span>
        </div>
        {PEOPLE.map((p) => (
          <div key={p.code} className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,3fr)] items-center gap-3 border-t border-white/[0.04] px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={p.name} size="xs" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-medium text-fg">{p.name}</span>
                <span className="block text-[10px] text-fg-3">{p.code}</span>
              </span>
            </span>
            <span className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
              {([...p.row] as Mark[]).map((m, i) => (
                <span key={i} title={LEGEND.find((l) => l.mark === m)?.label} className={cn('flex h-4 items-center justify-center rounded-full text-[9px] font-semibold text-[#2f3440]', m === 'W' ? 'bg-control text-transparent' : TONE_DOT[MARK_TONE[m]])}>
                  {m === 'W' ? '' : m}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/80">
        {LEGEND.map((l) => <span key={l.mark} className="inline-flex items-center gap-1"><span className={cn('size-2.5 rounded-full', TONE_DOT[MARK_TONE[l.mark]])} />{l.label}</span>)}
      </div>
    </MockFrame>
  )
}

const STAGES = [
  { key: 'attendance', label: 'Attendance locked' }, { key: 'claims', label: 'Claims closed' }, { key: 'generated', label: 'Generated' },
  { key: 'hr', label: 'HR reviewed' }, { key: 'finance', label: 'Finance approved' }, { key: 'locked', label: 'Locked' },
  { key: 'released', label: 'Released' }, { key: 'published', label: 'Payslips published' },
]
const ENTRIES = [
  // PF: 12% of basic (half of gross), capped at the ₹25,000 ceiling in force from 17 Sep 2026.
  { name: 'Aditi Singh', gross: 8_500_000, pf: 300_000, esi: 0, pt: 20_000, status: 'reviewed' },
  { name: 'Rohan Mehta', gross: 4_200_000, pf: 252_000, esi: 0, pt: 20_000, status: 'reviewed' },
  { name: 'Kavya Nair', gross: 2_000_000, pf: 120_000, esi: 15_000, pt: 20_000, status: 'on_hold_pay' },
  { name: 'Arjun Rao', gross: 6_100_000, pf: 300_000, esi: 0, pt: 20_000, status: 'reviewed' },
]

/** Payroll run: the eight-stage stepper and entries with PF, ESI, PT and net pay. */
export function MusterPayrollMock() {
  return (
    <MockFrame label="Preview of a Muster payroll run" path="/app/hr/payroll/2026-10" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><Banknote className="size-3.5" strokeWidth={1.5} aria-hidden /> Payroll · October 2026</span>
        <MockPill primary>Send to finance</MockPill>
      </div>
      <div className="mt-4 [&_ol]:flex-wrap [&_ol]:gap-y-3"><Stepper steps={STAGES} current={3} /></div>
      <div className="mt-4 overflow-hidden rounded-[10px] bg-[#232323] text-[11px]">
        <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_minmax(0,1.4fr)] gap-2 border-b border-line/70 px-3 py-2 text-[10px] text-white">
          <span>Employee</span><span className="text-right">Gross</span><span className="text-right">PF</span><span className="text-right">ESI</span><span className="text-right">PT</span><span className="text-right">Status</span>
        </div>
        {ENTRIES.map((e) => (
          <div key={e.name} className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_minmax(0,1.4fr)] gap-2 items-center border-t border-white/[0.04] px-3 py-2.5">
            <span className="truncate font-medium text-fg">{e.name}</span>
            <span className="text-right text-fg">{formatINR(e.gross, { decimals: 0 })}</span>
            <span className="text-right text-fg-2">{formatINR(e.pf, { decimals: 0 })}</span>
            <span className="text-right text-fg-2">{e.esi ? formatINR(e.esi, { decimals: 0 }) : '–'}</span>
            <span className="text-right text-fg-2">{formatINR(e.pt, { decimals: 0 })}</span>
            <span className="flex justify-end"><StatusPill status={e.status} label={e.status === 'on_hold_pay' ? 'On hold' : 'Reviewed'} /></span>
          </div>
        ))}
      </div>
    </MockFrame>
  )
}

const LETTERS = [
  { ref: 'VW/HR/2026/0141', type: 'Offer letter', to: 'Meera Iyer', date: '29 Sep 2026', status: 'issued' },
  { ref: 'VW/HR/2026/0140', type: 'Experience letter', to: 'Sandeep Kulkarni', date: '26 Sep 2026', status: 'issued' },
  { ref: 'VW/HR/2026/0139', type: 'Salary revision', to: 'Rohan Mehta', date: '24 Sep 2026', status: 'issued' },
  { ref: 'VW/HR/2026/0138', type: 'Warning letter', to: 'Nikhil Batra', date: '19 Sep 2026', status: 'revoked' },
]

/** HR letters register: numbered references, templates, recipients, issued or revoked. */
export function MusterLettersMock() {
  return (
    <MockFrame label="Preview of the Muster HR letters register" path="/app/hr/letters" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><FileSignature className="size-3.5" strokeWidth={1.5} aria-hidden /> HR letters</span>
        <MockPill primary>New letter</MockPill>
      </div>
      <div className="mt-4 grid gap-2">
        {LETTERS.map((l) => (
          <div key={l.ref} className="flex items-center gap-3 rounded-[10px] bg-white/[0.04] px-3 py-2.5">
            <FileSignature className="size-4 shrink-0 text-icon-muted" strokeWidth={1.5} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-fg">{l.type} · {l.to}</span>
              <span className="block text-[10px] text-fg-3">{l.ref} · {l.date}</span>
            </span>
            <StatusPill status={l.status} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-fg-3">Revoked: issued in error · kept on record with the reason</p>
    </MockFrame>
  )
}
