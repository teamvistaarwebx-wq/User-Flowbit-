import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarDays, Handshake, IndianRupee, Layers, Percent, Sprout, UserRound } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { StatusPill } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PanelHeader, SolidCard, TBODY_ROW, THEAD_ROW, TableCard, Td, Th } from '@/components/orbit/parts'
import { DealStageBadge } from '@/components/orbit/stage-badge'

type DealRow = { id: string; title: string; stageLabel: string; color: string; status: 'open' | 'won' | 'lost'; valuePaise: number; probability: number; expectedCloseDate: string | null; ownerName: string }

export function DealsTab({ deals, leads, newDeal }: { deals: DealRow[]; leads: { id: string; companyName: string; convertedAt: Date | null }[]; newDeal: ReactNode }) {
  return (
    <div className="space-y-3">
      <TableCard icon={<Handshake />} title="Deals" subtitle={deals.length ? 'Open, won and lost deals with this client.' : undefined}>
        {deals.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState icon={<Handshake />} title="No deals yet" description="Create a deal, or convert a lead for this client in Orbit." action={newDeal} compact />
          </div>
        ) : (
          <div className="overflow-x-auto pb-3">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className={THEAD_ROW}>
                  <Th icon={<Handshake strokeWidth={1.5} />}>Deal</Th>
                  <Th icon={<Layers strokeWidth={1.5} />}>Stage</Th>
                  <Th icon={<IndianRupee strokeWidth={1.5} />} align="right">Value</Th>
                  <Th icon={<Percent strokeWidth={1.5} />} align="right">Prob.</Th>
                  <Th icon={<CalendarDays strokeWidth={1.5} />}>Expected close</Th>
                  <Th>Status</Th>
                  <Th icon={<UserRound strokeWidth={1.5} />}>Owner</Th>
                </tr>
              </thead>
              <tbody>
                <tr aria-hidden className="h-1.5" />
                {deals.map((d) => (
                  <tr key={d.id} className={cn(TBODY_ROW, 'h-11')}>
                    <Td><Link href={`/app/orbit/deals/${d.id}`} className="text-sm text-white transition-colors hover:text-blush">{d.title}</Link></Td>
                    <Td><DealStageBadge label={d.stageLabel} color={d.color} status={d.status} /></Td>
                    <Td align="right" className="tabular-nums">{formatINR(d.valuePaise, { decimals: 0 })}</Td>
                    <Td align="right" className="tabular-nums text-[#979797]">{d.probability}%</Td>
                    <Td className="whitespace-nowrap text-[#979797]">{d.expectedCloseDate ? formatDate(d.expectedCloseDate) : '—'}</Td>
                    <Td><StatusPill status={d.status} /></Td>
                    <Td className="whitespace-nowrap">{d.ownerName}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
      {leads.length ? (
        <SolidCard>
          <PanelHeader icon={<Sprout />} title="Origin" subtitle="Leads that became this client." className="mb-3" />
          <ul>
            {leads.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 text-sm last:border-0">
                <Link href={`/app/orbit/leads/${l.id}`} className="text-white transition-colors hover:text-blush">{l.companyName}</Link>
                <span className="text-[13px] text-[#979797]">Converted {formatDate(l.convertedAt)}</span>
              </li>
            ))}
          </ul>
        </SolidCard>
      ) : null}
    </div>
  )
}
