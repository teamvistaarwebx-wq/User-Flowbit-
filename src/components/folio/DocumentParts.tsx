import type { ReactNode } from 'react'
import { Building2, CalendarDays, Calculator, Hash, IndianRupee, ListOrdered, Percent, ReceiptText } from 'lucide-react'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { stateLabelOf } from '@/modules/folio/engine/states'
import { Fact, OverviewCard, PanelHeader, SolidCard, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from './ui'

/**
 * Shared read-only pieces of the invoice, quote and credit note pages, built like the dashboard's
 * "Project overview" (party on the left, facts on the right, a hairline between) and "Assign to me" (lines).
 * Server-safe.
 */

export type PartyView = { name?: string | null; addressLines?: string[] | null; city?: string | null; pincode?: string | null; stateCode?: string | null; gstin?: string | null }

export function BilledTo({ party, showGstin, title = 'Billed to' }: { party: PartyView; showGstin: boolean; title?: string }) {
  return (
    <div className="min-w-0">
      <PanelHeader icon={<Building2 />} title={title} />
      <p className="mt-4 text-lg font-semibold leading-6 text-white">{party.name || '—'}</p>
      <div className="mt-1.5 space-y-0.5 text-[13px] leading-5 text-white/75">
        {(party.addressLines ?? []).map((l) => <p key={l}>{l}</p>)}
        {party.city || party.pincode ? <p>{[party.city, party.pincode].filter(Boolean).join(' ')}</p> : null}
      </div>
      {party.stateCode || (showGstin && party.gstin) ? (
        <div className="mt-3 space-y-0.5 text-[13px] text-fg-2">
          {party.stateCode ? <p>State · {stateLabelOf(party.stateCode)}</p> : null}
          {showGstin && party.gstin ? <p className="tabular-nums">GSTIN · {party.gstin}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export function DatesBlock({ items, title = 'Dates' }: { items: { label: string; value: ReactNode }[]; title?: string }) {
  return (
    <div className="min-w-0">
      <PanelHeader icon={<CalendarDays />} title={title} />
      <div className="mt-3">
        {items.map((i) => (
          <Fact key={i.label} label={i.label}>
            {i.value}
          </Fact>
        ))}
      </div>
    </div>
  )
}

/** The party/facts card: two columns divided by the Project overview's 1px #6B676C line; `footer` spans both. */
export function DocumentHead({ left, right, footer }: { left: ReactNode; right: ReactNode; footer?: ReactNode }) {
  return (
    <OverviewCard>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] sm:gap-x-7">
        {left}
        <span aria-hidden className="hidden w-px self-stretch bg-line-soft sm:block" />
        {right}
      </div>
      {footer ? <div className="mt-5 border-t border-line-soft/60 pt-4">{footer}</div> : null}
    </OverviewCard>
  )
}

export type LineView = { id: string; description: string; hsnSac?: string | null; quantity: number; unit?: string | null; ratePaise: number; discountPercent?: number; gstRatePercent: number; taxablePaise: number }

export function LinesCard({ lines, isTax, title = 'Lines' }: { lines: LineView[]; isTax: boolean; title?: string }) {
  const hasDiscount = lines.some((l) => (l.discountPercent ?? 0) > 0)
  return (
    <TableCard icon={<ListOrdered />} title={title} subtitle={`${lines.length} ${lines.length === 1 ? 'line' : 'lines'}${isTax ? ', before GST' : ''}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th className="w-10">#</Th>
              <Th>Description</Th>
              {isTax ? <Th icon={<Hash />}>SAC</Th> : null}
              <Th align="right">Qty</Th>
              <Th icon={<IndianRupee />} align="right">Rate</Th>
              {hasDiscount ? <Th icon={<Percent />} align="right">Disc</Th> : null}
              {isTax ? <Th icon={<ReceiptText />} align="right">GST</Th> : null}
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden className="h-1.5" />
            {lines.map((l, i) => (
              <tr key={l.id} className={TBODY_ROW}>
                <Td className="tabular-nums text-[#979797]">{i + 1}</Td>
                <Td className="text-white">{l.description}</Td>
                {isTax ? <Td className="tabular-nums text-white/75">{l.hsnSac || '—'}</Td> : null}
                <Td align="right" className="whitespace-nowrap tabular-nums text-white/75">
                  {Number(l.quantity.toFixed(3))} {l.unit}
                </Td>
                <Td align="right" className="whitespace-nowrap tabular-nums text-white/75">{formatINR(l.ratePaise)}</Td>
                {hasDiscount ? <Td align="right" className="text-white/75">{l.discountPercent ? `${l.discountPercent}%` : '—'}</Td> : null}
                {isTax ? <Td align="right" className="text-white/75">{l.gstRatePercent}%</Td> : null}
                <Td align="right" className="whitespace-nowrap font-medium tabular-nums text-white">{formatINR(l.taxablePaise)}</Td>
              </tr>
            ))}
            <tr aria-hidden className="h-2" />
          </tbody>
        </table>
      </div>
    </TableCard>
  )
}

export function SummaryRow({ label, value, tone, strong }: { label: ReactNode; value: string; tone?: 'danger' | 'success' | 'muted'; strong?: boolean }) {
  return (
    <div className={cn('flex min-h-8 items-center justify-between gap-3 text-sm', strong ? 'font-semibold text-white' : 'text-white/75', tone === 'danger' && 'text-[#FF6A66]', tone === 'success' && 'text-[#2DCBAF]', tone === 'muted' && 'text-fg-3')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/** The big total under the summary rows: a hairline, the figure at 24/600, the amount in words under it. */
export function SummaryTotal({ label = 'Total', totalPaise, words }: { label?: string; totalPaise: number; words?: string }) {
  return (
    <div className="my-3 border-t border-line pt-3">
      <div className="flex items-end justify-between gap-3">
        <span className="text-sm text-white/75">{label}</span>
        <span className="text-2xl font-semibold leading-8 tabular-nums text-white">{formatINR(totalPaise)}</span>
      </div>
      {words ? <p className="mt-1 text-xs leading-5 text-fg-2">{words}</p> : null}
    </div>
  )
}

/** The summary aside, as "My attendance": the opaque solid card. */
export function SummaryCard({ title = 'Summary', children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <SolidCard className={className}>
      <PanelHeader icon={<Calculator />} title={title} className="mb-3" />
      {children}
    </SolidCard>
  )
}

export function TextBlock({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</p>
      <p className="whitespace-pre-line text-[13px] leading-5 text-white/80">{text}</p>
    </div>
  )
}
