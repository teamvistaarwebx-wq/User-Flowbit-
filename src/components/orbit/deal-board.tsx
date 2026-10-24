'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { formatINRCompact } from '@/lib/money'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Kanban, KanbanCard, noDrag, type KanbanColumn } from '@/components/ui/kanban'
import { moveDealStage } from '@/modules/orbit/deals.actions'
import { weighted } from '@/modules/orbit/metrics'
import type { DealCardData, OrbitChoices } from '@/modules/orbit/record-types'
import { KeyIcon } from './icons'
import { dueTone } from './parts'
import { ReasonDialog, WonDialog } from './stage-dialogs'
import { dayDiff, dueLabel } from './time'

function DealCard({ deal, today }: { deal: DealCardData; today: string }) {
  const overdueClose = deal.status === 'open' && deal.expectedCloseDate && deal.expectedCloseDate < today
  const late = deal.nextDue ? dayDiff(deal.nextDue, today) : null
  return (
    <KanbanCard className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/orbit/deals/${deal.id}`} className="min-w-0 text-sm font-medium leading-5 text-white transition-colors hover:text-blush" {...noDrag}>{deal.title}</Link>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{formatINRCompact(deal.valuePaise)}</span>
      </div>
      <p className="-mt-1.5 truncate text-xs text-[#979797]">{deal.clientName}</p>
      <div className="flex items-center gap-2.5 text-xs text-[#979797]">
        <span className="tabular-nums text-white">{deal.probability}%</span>
        {deal.expectedCloseDate ? <span className={cn(overdueClose && 'text-[#FF2D31]')}>Close {dueLabel(deal.expectedCloseDate)}</span> : null}
        {deal.source ? <KeyIcon kind="source" value={deal.source} className="size-[15px] text-icon-muted" /> : null}
        <span className="ml-auto" title={deal.ownerName}><Avatar name={deal.ownerName} size="xs" ring /></span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs">
        {deal.nextDue && late !== null ? (
          <span className={cn('min-w-0 truncate', dueTone(late))}>{deal.nextTitle || 'Follow up'} · {dueLabel(deal.nextDue)}</span>
        ) : <span className="text-[#979797]">{deal.status === 'open' ? 'No next step' : ''}</span>}
        {deal.status === 'open' ? <span className="shrink-0 whitespace-nowrap text-[#979797]">{deal.daysInStage}d in stage</span> : null}
      </div>
    </KanbanCard>
  )
}

export type DealBoardProps = { deals: DealCardData[]; choices: Pick<OrbitChoices, 'dealStages' | 'lostReasons' | 'wonReasons'>; canClose: boolean; today: string }

type Pending = { kind: 'won' | 'lost'; deal: DealCardData } | null

/** Deals by stage with ₹ totals; drag between open stages, drop on Won/Lost to close. */
export function DealBoard({ deals, choices, canClose, today }: DealBoardProps) {
  const [pending, setPending] = useState<Pending>(null)
  const columns: KanbanColumn[] = useMemo(() => {
    const sum = (key: string) => deals.filter((d) => d.columnId === key).reduce((s, d) => s + d.valuePaise, 0)
    const wsum = (key: string) => deals.filter((d) => d.columnId === key).reduce((s, d) => s + weighted(d.valuePaise, d.probability), 0)
    return [
      ...choices.dealStages.map((s) => ({ id: s.key, title: `${s.label} · ${s.probability}%`, meta: `${formatINRCompact(sum(s.key))} · weighted ${formatINRCompact(wsum(s.key))}` })),
      { id: 'won', title: 'Won · 90d', meta: canClose ? formatINRCompact(sum('won')) : <span className="inline-flex items-center gap-1"><Lock className="size-3" />{formatINRCompact(sum('won'))}</span> },
      { id: 'lost', title: 'Lost · 90d', meta: canClose ? formatINRCompact(sum('lost')) : <span className="inline-flex items-center gap-1"><Lock className="size-3" />{formatINRCompact(sum('lost'))}</span> },
    ]
  }, [deals, choices.dealStages, canClose])

  const onMove = async (id: string, to: string) => {
    const deal = deals.find((d) => d.id === id)
    if (!deal || deal.columnId === to) return false
    if (deal.status !== 'open') {
      toast.error('This deal is closed. Reopen it from the deal page.')
      return false
    }
    if (!deal.canEdit) {
      toast.error('Only the deal owner or a reviewer can move this deal.')
      return false
    }
    if (to === 'won' || to === 'lost') {
      if (!canClose) {
        toast.error(`Only a reviewer can mark a deal ${to === 'won' ? 'Won' : 'Lost'}.`)
        return false
      }
      setPending({ kind: to, deal })
      return false
    }
    const res = await moveDealStage({ id, fromStage: deal.columnId, toStage: to })
    if (!res.ok) {
      toast.error(res.error)
      return false
    }
    toast.success(res.message ?? 'Deal moved')
    return true
  }

  const close = (v: boolean) => !v && setPending(null)
  return (
    <>
      <Kanban columns={columns} items={deals} renderItem={(d) => <DealCard deal={d} today={today} />} onMove={onMove} emptyLabel="Drop a deal here" />
      {pending?.kind === 'won' ? <WonDialog deal={{ id: pending.deal.id, title: pending.deal.title, valuePaise: pending.deal.valuePaise }} reasons={choices.wonReasons} today={today} open onOpenChange={close} /> : null}
      {pending?.kind === 'lost' ? <ReasonDialog reasons={choices.lostReasons} target={{ kind: 'deal', id: pending.deal.id, title: pending.deal.title }} open onOpenChange={close} /> : null}
    </>
  )
}
