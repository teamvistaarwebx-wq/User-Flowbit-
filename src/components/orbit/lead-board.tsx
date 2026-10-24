'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatINRCompact } from '@/lib/money'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Kanban, KanbanCard, noDrag, type KanbanColumn } from '@/components/ui/kanban'
import { LEAD_STAGE_LABEL, LEAD_STAGE_RANK, OPEN_LEAD_STAGES, type LeadStage } from '@/modules/orbit/constants'
import { moveLeadStage } from '@/modules/orbit/lead-stage.actions'
import type { LeadCardData, OrbitChoices } from '@/modules/orbit/record-types'
import { ConvertDialog } from './convert-dialog'
import { KeyIcon } from './icons'
import { LogMeetingDialog, MeetingDialog, ReasonDialog } from './stage-dialogs'
import { TouchCell } from './lead-table'
import { IcpBars, Note, dueTone } from './parts'
import { dayDiff, dueLabel } from './time'

type Pending =
  | { kind: 'meeting'; card: LeadCardData }
  | { kind: 'log_meeting'; card: LeadCardData }
  | { kind: 'reason'; card: LeadCardData; to: 'lost' | 'disqualified' }
  | { kind: 'convert'; card: LeadCardData }

function Card({ card, today }: { card: LeadCardData; today: string }) {
  const late = card.nextDue ? dayDiff(card.nextDue, today) : null
  return (
    <KanbanCard className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/orbit/leads/${card.id}`} className="min-w-0 text-sm font-medium leading-5 text-white transition-colors hover:text-blush" {...noDrag}>{card.companyName}</Link>
        {card.valuePaise ? <span className="shrink-0 text-[13px] tabular-nums text-white">{formatINRCompact(card.valuePaise)}</span> : null}
      </div>
      {card.contactName ? <p className="-mt-1.5 truncate text-xs text-[#979797]">{card.contactName}{card.designation ? ` · ${card.designation}` : ''}</p> : null}
      <div className="flex items-center gap-2.5 text-icon-muted">
        <span title={card.sectorLabel}><KeyIcon kind="sector" value={card.sector} className="size-[15px]" /></span>
        <span title={card.sourceLabel}><KeyIcon kind="source" value={card.source} className="size-[15px]" /></span>
        {card.icpScore ? <IcpBars score={card.icpScore} /> : null}
        <span className="ml-auto" title={card.ownerName}><Avatar name={card.ownerName} size="xs" ring /></span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs">
        {card.nextDue && late !== null ? (
          <span className={cn('truncate', dueTone(late))}>{late > 0 ? `${late}d late` : late === 0 ? 'Due today' : dueLabel(card.nextDue)}</span>
        ) : <span className="text-[#979797]">No next step</span>}
        <TouchCell days={card.daysSinceTouch} stale={card.stale} />
      </div>
    </KanbanCard>
  )
}

export type LeadBoardProps = { cards: LeadCardData[]; showClosed: boolean; today: string; choices: Pick<OrbitChoices, 'dealStages' | 'owners' | 'lostReasons'>; canClose: boolean; warmSources: string[]; truncated: string[] }

/** Leads by stage; drag to move (guards and dialogs run on drop). */
export function LeadBoard({ cards, showClosed, today, choices, canClose, warmSources, truncated }: LeadBoardProps) {
  const [pending, setPending] = useState<Pending | null>(null)
  const columns: KanbanColumn[] = [...OPEN_LEAD_STAGES, 'converted', 'lost', 'disqualified'].map((s) => ({
    id: s,
    title: LEAD_STAGE_LABEL[s as LeadStage],
    meta: !showClosed && LEAD_STAGE_RANK[s as LeadStage] >= 5 ? 'drop here' : truncated.includes(s) ? '100+' : undefined,
  }))

  const ask = (p: Pending) => {
    setPending(p)
    return false
  }

  const onMove = async (id: string, to: string) => {
    const card = cards.find((c) => c.id === id)
    if (!card || card.columnId === to) return false
    const toStage = to as LeadStage
    if (!card.canEdit) {
      toast.error("You can view leads but not move them. Ask the lead's owner or reviewer.")
      return false
    }
    if (toStage === 'meeting_booked' && card.stage === 'engaged') return ask({ kind: 'meeting', card })
    if (toStage === 'meeting_done' && card.stage === 'meeting_booked' && !card.hasMeetingHeld) return ask({ kind: 'log_meeting', card })
    if (toStage === 'lost' || toStage === 'disqualified') {
      if (toStage === 'lost' && !canClose) {
        toast.error('Only a reviewer can mark a lead Lost.')
        return false
      }
      return ask({ kind: 'reason', card, to: toStage })
    }
    if (toStage === 'converted') {
      if (card.stage !== 'meeting_done') {
        toast.error('Convert a lead after its meeting is done.')
        return false
      }
      return ask({ kind: 'convert', card })
    }
    const res = await moveLeadStage({ id, fromStage: card.stage, toStage })
    if (!res.ok) {
      toast.error(res.error)
      return false
    }
    toast.success(res.message ?? `${card.companyName} moved to ${LEAD_STAGE_LABEL[toStage]}`)
    return true
  }

  const close = () => setPending(null)
  const ref = pending ? { id: pending.card.id, stage: pending.card.stage, companyName: pending.card.companyName } : null

  return (
    <>
      <Note className="mb-3">
        Drag a card to move it. A lead can&apos;t become Contacted without a logged outreach, or Engaged without a logged reply{warmSources.length ? ' (warm sources may skip Contacted)' : ''}. A red clock means nothing has happened on that lead for a while.
      </Note>
      <Kanban columns={columns} items={cards} renderItem={(c) => <Card card={c} today={today} />} onMove={onMove} emptyLabel="Drop a lead here" />
      {pending?.kind === 'meeting' && ref ? <MeetingDialog lead={ref} today={today} open onOpenChange={(v) => !v && close()} /> : null}
      {pending?.kind === 'log_meeting' && ref ? <LogMeetingDialog lead={ref} open onOpenChange={(v) => !v && close()} /> : null}
      {pending?.kind === 'reason' && ref ? <ReasonDialog reasons={choices.lostReasons} target={{ kind: 'lead', lead: ref, to: pending.to }} open onOpenChange={(v) => !v && close()} /> : null}
      {pending?.kind === 'convert' ? (
        <ConvertDialog
          lead={{ id: pending.card.id, companyName: pending.card.companyName, contactName: pending.card.contactName, email: pending.card.email, valuePaise: pending.card.valuePaise, ownerId: pending.card.ownerId }}
          choices={choices}
          canAssign={canClose}
          today={today}
          open
          onOpenChange={(v) => !v && close()}
        />
      ) : null}
    </>
  )
}
