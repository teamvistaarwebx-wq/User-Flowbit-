import { Building2, KeyRound, UserRound } from 'lucide-react'
import { ChainDiagram, HubDiagram } from './connect-diagrams'
import { Reveal } from './reveal'

const WORK = 'var(--work)'
const MUSTER = 'var(--muster)'
const ORBIT = 'var(--orbit)'
const FOLIO = 'var(--folio)'
const BRAND = 'var(--orchid)'

const STORIES = [
  {
    icon: KeyRound,
    label: 'One login',
    title: 'Sign in once, use all four',
    body: 'The same member gets tasks in Work, checks in for Muster, works leads in Orbit and raises invoices in Folio. Roles decide what each person sees.',
    diagram: <HubDiagram title="One login opens Work, Muster and Orbit" center={{ label: 'Aditi Singh', color: BRAND }} spokes={[{ label: 'Tasks', color: WORK }, { label: 'Check-in', color: MUSTER }, { label: 'Leads', color: ORBIT }]} />,
  },
  {
    icon: Building2,
    label: 'One client list',
    title: 'A client exists once',
    body: 'Their projects live in Work, their deals in Orbit, their invoices and ledger in Folio. Win a deal and turn it into a quote or invoice with one click.',
    diagram: <HubDiagram title="One client record shared by Work, Orbit and Folio" center={{ label: 'Kalpa Studio', color: BRAND }} spokes={[{ label: 'Projects', color: WORK }, { label: 'Deals', color: ORBIT }, { label: 'Invoices', color: FOLIO }]} />,
  },
  {
    icon: UserRound,
    label: 'One people record',
    title: 'Check-in to payslip, no exports',
    body: 'Check in from the sidebar. It lands in the attendance register, the locked register feeds payroll, and the payslip reads the same employee record.',
    diagram: <ChainDiagram title="Check-in feeds the register, which feeds payroll" nodes={[{ label: 'Check-in', color: MUSTER }, { label: 'Register', color: MUSTER }, { label: 'Payroll', color: MUSTER }]} />,
  },
]

/** "Connected, not stitched together": one login, one client list, one people record. */
export function Connected() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STORIES.map((s, i) => (
        <Reveal key={s.label} delay={i * 90}>
          <article className="glass flex h-full flex-col rounded-[14px] p-6">
            <p className="section-label flex items-center gap-2"><s.icon className="size-4" strokeWidth={1.5} aria-hidden />{s.label}</p>
            <div className="my-5 rounded-[10px] bg-black/30 p-3">{s.diagram}</div>
            <h3 className="text-lg font-semibold text-white">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{s.body}</p>
          </article>
        </Reveal>
      ))}
    </div>
  )
}
