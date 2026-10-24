'use client'

import { useMemo, useState } from 'react'
import { Calculator, Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { Switch } from '@/components/ui/switch'
import { FOLIO_INCLUDED_FIRMS, FOLIO_INCLUDED_USERS, FOLIO_MAX_FIRMS, GST_PERCENT, PLAN_PRICES, type BillingCycle, type MusterTier, type Quote } from '@/lib/plans'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { ORBIT_SEATS_DEFAULT, TEAM_DEFAULT, TEAM_MAX, TEAM_MIN, estimate, extraFirmCopy, rupees } from '@/modules/marketing/pricing'
import { START_FREE_SENTENCE } from '@/modules/marketing/start-free'

type MusterChoice = 'off' | MusterTier

const MUSTER_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'starter', label: 'Starter' },
  { value: 'business', label: 'Business' },
]

const periodWord = (cycle: BillingCycle) => (cycle === 'yearly' ? 'the first year' : 'a month')
const ORBIT_MIN = PLAN_PRICES.orbit.minimum

/** `requested` is what was chosen per line; a line billed above it says it is the minimum. */
function QuoteCard({ title, quote, cycle, requested, highlight, empty }: { title: string; quote: Quote | null; cycle: BillingCycle; requested: Partial<Record<string, number>>; highlight?: boolean; empty?: string }) {
  return (
    <div className={cn('rounded-[14px] p-5', highlight ? 'edge-selected bg-white/[0.07]' : 'lit-edge bg-white/[0.04]')}>
      <p className="section-label">{title}</p>
      {quote ? (
        <>
          <ul className="mt-3 grid gap-1.5 text-sm">
            {quote.lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-3">
                <span className="text-white/75">
                  {l.label}{l.unit !== 'workspace' ? ` · ${l.quantity} × ${rupees(l.unitPaise)}` : ''}
                  {(requested[l.key] ?? l.quantity) < l.quantity ? <span className="block text-[11px] text-[#959596]">Billed for the {l.quantity}-{l.unit} minimum</span> : null}
                </span>
                <span className="tabular-nums text-white">{rupees(l.amountPaise)}</span>
              </li>
            ))}
            {quote.discountPaise ? (
              <li className="flex justify-between gap-3 text-mint"><span>First-year discount ({quote.discountPercent}% off)</span><span className="tabular-nums">−{rupees(quote.discountPaise)}</span></li>
            ) : null}
            <li className="flex justify-between gap-3 text-[#979797]"><span>GST {GST_PERCENT}%</span><span>{rupees(quote.gstPaise)}</span></li>
          </ul>
          <p className="mt-4 text-[30px] font-semibold tabular-nums text-white">{rupees(quote.subtotalPaise)}<span className="ml-1.5 text-sm font-normal text-[#979797]">{periodWord(cycle)} + GST</span></p>
          <p className="mt-1 text-xs text-fg-2">{rupees(quote.totalPaise)} with GST{cycle === 'yearly' ? ` · about ${rupees(quote.perMonthPaise)} a month · then ${rupees(quote.listSubtotalPaise)} a year + GST` : ''}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-[#979797]">{empty}</p>
      )}
    </div>
  )
}

/** Seat slider calculator: picked products vs Suite, through the same quote() checkout uses. */
export function PricingCalculator({ cycle }: { cycle: BillingCycle }) {
  const [teamSize, setTeamSize] = useState(TEAM_DEFAULT)
  const [work, setWork] = useState(true)
  const [muster, setMuster] = useState<MusterChoice>('business')
  const [orbit, setOrbit] = useState(false)
  const [orbitSeats, setOrbitSeats] = useState(ORBIT_SEATS_DEFAULT)
  const [folio, setFolio] = useState(true)
  const [folioFirms, setFolioFirms] = useState(FOLIO_INCLUDED_FIRMS)

  const result = useMemo(
    () => estimate({ teamSize, work, muster: muster === 'off' ? null : muster, orbit, folio, orbitSeats, folioFirms, cycle }),
    [teamSize, work, muster, orbit, folio, orbitSeats, folioFirms, cycle],
  )
  const changeFirms = (delta: number) => setFolioFirms((n) => Math.min(FOLIO_MAX_FIRMS, Math.max(FOLIO_INCLUDED_FIRMS, n + delta)))
  const fill = ((teamSize - TEAM_MIN) / (TEAM_MAX - TEAM_MIN)) * 100
  const changeSeats = (delta: number) => setOrbitSeats((n) => Math.min(teamSize, Math.max(ORBIT_MIN, n + delta)))
  const shownSeats = Math.max(ORBIT_MIN, Math.min(orbitSeats, teamSize))
  const requested = { suite: teamSize, work: teamSize, muster_starter: teamSize, muster_business: teamSize, orbit: shownSeats }

  return (
    <div className="glass grid gap-8 rounded-[16px] p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="section-label flex items-center gap-2"><Calculator className="size-4" strokeWidth={1.5} aria-hidden /> Estimate your bill</p>
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="team-size" className="text-sm font-medium text-white">Team size</label>
            <span className="text-2xl font-semibold tabular-nums text-white">{teamSize}<span className="ml-1 text-sm font-normal text-[#979797]">people</span></span>
          </div>
          <input
            id="team-size"
            type="range"
            min={TEAM_MIN}
            max={TEAM_MAX}
            value={teamSize}
            onChange={(e) => setTeamSize(Number(e.target.value))}
            onPointerUp={() => play('toggle')}
            className="mt-3 h-4 w-full cursor-pointer appearance-none rounded-full bg-white/[0.14] bg-no-repeat [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
            style={{ backgroundImage: 'var(--grad-progress)', backgroundSize: `${Math.max(fill, 4)}% 100%` }}
          />
          <div className="mt-1.5 flex justify-between text-[11px] text-[#979797]"><span>{TEAM_MIN}</span><span>{TEAM_MAX}</span></div>
        </div>

        <div className="mt-6 grid gap-4">
          <Switch label="Flowbit Work" description="Everyone who signs in" checked={work} onCheckedChange={setWork} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-white">Muster</p>
              <p className="text-xs text-[#959596]">Business adds payroll with PF, ESI and PT</p>
            </div>
            <ChipGroup size="sm" options={MUSTER_OPTIONS} value={muster} onValueChange={(v) => setMuster(v as MusterChoice)} />
          </div>
          <Switch label="Orbit" description="Sales users only" checked={orbit} onCheckedChange={setOrbit} />
          {orbit ? (
            <div className="-mt-1 flex items-center justify-between rounded-[10px] bg-white/[0.05] px-4 py-2.5">
              <span className="text-xs text-white/80">Sales users</span>
              <span className="flex items-center gap-2">
                <IconButton label="Fewer sales users" size="sm" variant="secondary" sound="toggle" disabled={shownSeats <= ORBIT_MIN} onClick={() => changeSeats(-1)}><Minus className="size-3.5" /></IconButton>
                <span className="w-6 text-center text-sm font-semibold tabular-nums text-white" aria-live="polite">{shownSeats}</span>
                <IconButton label="More sales users" size="sm" variant="secondary" sound="toggle" disabled={orbitSeats >= teamSize} onClick={() => changeSeats(1)}><Plus className="size-3.5" /></IconButton>
              </span>
            </div>
          ) : null}
          <Switch label="Folio" description={`Flat per workspace, ${FOLIO_INCLUDED_FIRMS} firms and ${FOLIO_INCLUDED_USERS} users included`} checked={folio} onCheckedChange={setFolio} />
          <div className="-mt-1 flex items-center justify-between rounded-[10px] bg-white/[0.05] px-4 py-2.5">
            <span className="text-xs text-white/80">
              Firms you bill from
              <span className="block text-[11px] text-[#959596]">{folio ? extraFirmCopy() : `Folio is off, so this changes only the Suite price (Suite includes Folio). ${extraFirmCopy()}`}</span>
            </span>
            <span className="flex items-center gap-2">
              <IconButton label="Fewer firms" size="sm" variant="secondary" sound="toggle" disabled={folioFirms <= FOLIO_INCLUDED_FIRMS} onClick={() => changeFirms(-1)}><Minus className="size-3.5" /></IconButton>
              <span className="w-6 text-center text-sm font-semibold tabular-nums text-white" aria-live="polite">{folioFirms}</span>
              <IconButton label="More firms" size="sm" variant="secondary" sound="toggle" disabled={folioFirms >= FOLIO_MAX_FIRMS} onClick={() => changeFirms(1)}><Plus className="size-3.5" /></IconButton>
            </span>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <QuoteCard title="The products you picked" quote={result.picked} cycle={cycle} requested={requested} empty="Switch on at least one product to compare." />
        <QuoteCard title="Suite: all four" quote={result.suite} cycle={cycle} requested={requested} highlight />
        {result.suiteSavesPaise > 0 ? (
          <p className="px-1 text-sm font-medium text-mint animate-fade-in">
            Suite saves you {rupees(result.suiteSavesPaise)} {periodWord(cycle)}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-[#979797]">
          Estimate, counting each person once. Prices in INR, excluding {GST_PERCENT}% GST. {START_FREE_SENTENCE}
        </p>
      </div>
    </div>
  )
}
