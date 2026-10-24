import { Check, Minus } from 'lucide-react'
import { PLAN_PRICES } from '@/lib/plans'
import { rupees } from '@/modules/marketing/pricing'
import { Reveal } from './reveal'

const ROWS: { topic: string; typical: string; flowbit: string }[] = [
  { topic: 'Sign-in', typical: 'A separate login for the HR tool, the CRM, the invoicing app and the task board', flowbit: 'One login and one workspace for all four' },
  { topic: 'Clients', typical: 'Retyped in the CRM, the invoicing app and the project tracker', flowbit: 'One client record shared by Work, Orbit and Folio' },
  { topic: 'People', typical: 'The HR tool and the task tool each keep their own list of staff', flowbit: 'One person: login, attendance, leave and payroll' },
  { topic: 'Attendance to payroll', typical: 'Export the register, fix it in a spreadsheet, import it again', flowbit: 'Check-ins build the register; the locked register feeds payroll' },
  { topic: 'Indian rules', typical: 'Add-ons or spreadsheets for GST splits, PF, ESI and PT', flowbit: 'GST by place of supply, PF, ESI and PT by state, ₹ and IST built in' },
  { topic: 'Bills', typical: 'Several subscriptions, currencies and renewal dates', flowbit: `One subscription in INR; Suite is ${rupees(PLAN_PRICES.suite.monthlyPaise)} a person a month` },
  { topic: 'AI', typical: 'Assistants that may edit records for you', flowbit: 'Arc only drafts. Nothing changes until a person clicks Apply' },
]

/** A general comparison with running separate single-purpose tools (no named competitors). */
export function Comparison() {
  return (
    <Reveal>
      <div className="card-table overflow-hidden">
        <div className="hidden h-11 grid-cols-[1fr_1.6fr_1.6fr] items-center gap-6 border-b border-line px-6 text-sm text-white md:grid">
          <span>What changes</span>
          <span>Separate HR, CRM and billing tools</span>
          <span className="font-semibold text-blush">Flowbit</span>
        </div>
        <ul className="divide-y divide-white/[0.05]">
          {ROWS.map((r) => (
            <li key={r.topic} className="grid gap-3 px-6 py-5 md:grid-cols-[1fr_1.6fr_1.6fr] md:gap-6">
              <span className="text-sm font-semibold text-white">{r.topic}</span>
              <span className="flex gap-2.5 text-sm leading-relaxed text-[#979797]"><Minus className="mt-1 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden /><span><span className="sr-only">Separate tools: </span>{r.typical}</span></span>
              <span className="flex gap-2.5 text-sm leading-relaxed text-white"><Check className="mt-1 size-3.5 shrink-0 text-white/70" strokeWidth={1.5} aria-hidden /><span><span className="sr-only">Flowbit: </span>{r.flowbit}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-[#979797]">A general comparison with running several single-purpose tools side by side, not a review of any one product.</p>
    </Reveal>
  )
}
