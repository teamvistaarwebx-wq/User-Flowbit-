'use client'

import Link from 'next/link'
import { ArrowRight, Ban, CircleCheck, CircleX, Flag, Lock, RotateCcw, Trophy, Undo2 } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { LEAD_STAGE_LABEL, LEAD_STAGE_RANK, LEAD_STAGE_RULE, OPEN_LEAD_STAGES, type LeadStage } from '@/modules/orbit/constants'
import { moveLeadStage, reopenLead } from '@/modules/orbit/lead-stage.actions'
import { blockedReason, nextLeadStage, type LeadEvidence } from '@/modules/orbit/leadStage'
import type { OrbitChoices } from '@/modules/orbit/record-types'
import { ConvertDialog, type ConvertLead } from './convert-dialog'
import { Note, OverviewCard, PanelHeader } from './parts'
import { StageTrack } from './stage-track'
import { LogMeetingDialog, MeetingDialog, ReasonDialog } from './stage-dialogs'

const RAIL: LeadStage[] = [...OPEN_LEAD_STAGES, 'converted']

export type LeadStageCardProps = {
  lead: ConvertLead & { stage: LeadStage; /** Furthest open stage the lead reached (from its milestones); shown on the track once closed. */ closedFrom?: LeadStage | null; closeReason: string | null; convertedAt: string | null; client: { id: string; name: string } | null; deal: { id: string; title: string } | null }
  evidence: LeadEvidence
  can: { edit: boolean; close: boolean }
  sourceIsWarm: boolean
  choices: Pick<OrbitChoices, 'dealStages' | 'owners' | 'lostReasons'>
  today: string
}

/**
 * The lead's journey as the thick stage track. A lost or disqualified lead keeps the road it travelled: the stages
 * it passed are filled, and the stage it closed at becomes a red block naming the exit.
 */
function Rail({ stage, closedFrom }: { stage: LeadStage; closedFrom?: LeadStage | null }) {
  const closedExit = stage === 'lost' || stage === 'disqualified'
  const at = closedExit ? Math.max(0, RAIL.indexOf(closedFrom ?? 'new')) : RAIL.indexOf(stage)
  const rank = LEAD_STAGE_RANK[stage]
  const done = closedExit ? at : stage === 'converted' ? RAIL.length - 1 : RAIL.filter((s) => LEAD_STAGE_RANK[s] < rank).length
  return (
    <StageTrack
      label="Lead stage"
      stages={RAIL.map((s) => ({ key: s, label: LEAD_STAGE_LABEL[s], hint: LEAD_STAGE_RULE[s] }))}
      done={done}
      current={at}
      tone={stage === 'converted' ? 'success' : closedExit ? 'danger' : 'violet'}
      currentLabel={closedExit ? LEAD_STAGE_LABEL[stage] : undefined}
    />
  )
}

/** Stage rail, guarded "Move to …", exits, reopen and convert for one lead. */
export function LeadStageCard({ lead, evidence, can, sourceIsWarm, choices, today }: LeadStageCardProps) {
  const [move, moving] = useAction(moveLeadStage)
  const ref = { id: lead.id, stage: lead.stage, companyName: lead.companyName }
  const open = (OPEN_LEAD_STAGES as readonly string[]).includes(lead.stage)
  const next = nextLeadStage(lead.stage)
  // Read-only viewers get a plain note below, not a "Blocked" fix-it callout with the next stage's rule.
  const blocked = next && can.edit ? blockedReason({ to: next, can: { write: can.edit, close: can.close }, evidence }) : null
  const warmSkip = lead.stage === 'new' && sourceIsWarm && evidence.hasReply && can.edit
  const back = can.close ? OPEN_LEAD_STAGES.filter((s) => LEAD_STAGE_RANK[s] < LEAD_STAGE_RANK[lead.stage]) : []
  const go = (to: LeadStage) => move({ id: lead.id, fromStage: lead.stage, toStage: to })

  const nextButton = (() => {
    if (!open || !can.edit) return null
    if (lead.stage === 'meeting_done') {
      return <ConvertDialog lead={lead} choices={choices} canAssign={can.close} today={today} trigger={<Button variant="primary" icon={<Trophy className="size-4" />}>Convert to client + deal</Button>} />
    }
    if (!next) return null
    const label = `Move to ${LEAD_STAGE_LABEL[next]}`
    if (blocked) return <Button variant="primary" disabled icon={<Lock className="size-4" />}>{label}</Button>
    if (next === 'meeting_booked') return <MeetingDialog lead={ref} today={today} trigger={<Button variant="primary" iconRight={<ArrowRight className="size-4" />}>{label}</Button>} />
    if (next === 'meeting_done' && !evidence.hasMeetingHeld) return <LogMeetingDialog lead={ref} trigger={<Button variant="primary" iconRight={<ArrowRight className="size-4" />}>{label}</Button>} />
    return <Button variant="primary" loading={moving} onClick={() => go(next)} iconRight={<ArrowRight className="size-4" />}>{label}</Button>
  })()

  return (
    <OverviewCard>
      <PanelHeader icon={<Flag />} title="Stage" subtitle={open ? LEAD_STAGE_RULE[lead.stage] : undefined} className="mb-5" />
      <Rail stage={lead.stage} closedFrom={lead.closedFrom} />
      {open ? (
        <div className="mt-5 space-y-3">
          {!can.edit ? <p className="text-[13px] text-fg-2">You can view this lead. Ask its owner or reviewer to move it.</p> : null}
          {blocked && next ? (
            <Note tone="warning" icon={<Lock />}>
              <span className="font-medium text-white">Blocked.</span> {blocked} {LEAD_STAGE_RULE[next]}
            </Note>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {nextButton}
            {warmSkip ? <Button variant="secondary" loading={moving} onClick={() => go('engaged')}>Move to Engaged</Button> : null}
            {back.length ? (
              <DropdownMenu trigger={<Button variant="ghost" icon={<Undo2 className="size-4" />}>Move back</Button>} align="start" items={back.map((s) => ({ label: LEAD_STAGE_LABEL[s], onSelect: () => go(s) }))} />
            ) : null}
            <span className="hidden flex-1 sm:block" />
            {can.edit ? <ReasonDialog reasons={choices.lostReasons} target={{ kind: 'lead', lead: ref, to: 'disqualified' }} trigger={<Button variant="ghost" icon={<Ban className="size-4" />}>Disqualify</Button>} /> : null}
            {can.close ? <ReasonDialog reasons={choices.lostReasons} target={{ kind: 'lead', lead: ref, to: 'lost' }} trigger={<Button variant="ghost" icon={<CircleX className="size-4" />}>Mark lost</Button>} /> : null}
          </div>
        </div>
      ) : null}
      {lead.stage === 'lost' || lead.stage === 'disqualified' ? (
        <div className="mt-5 space-y-3">
          {lead.closeReason ? (
            <Note tone="danger" icon={<CircleX />}>
              <span className="font-medium text-white">{LEAD_STAGE_LABEL[lead.stage]}.</span> {lead.closeReason}
            </Note>
          ) : null}
          {can.close ? (
            <ConfirmDialog
              tone="primary"
              trigger={<Button variant="secondary" icon={<RotateCcw className="size-4" />}>Reopen</Button>}
              title={`Reopen ${lead.companyName}?`}
              description="It goes back to the stage it was closed from, and the close reason is cleared."
              confirmLabel="Reopen"
              onConfirm={() => reopenLead({ id: lead.id })}
            />
          ) : (
            <p className="text-[13px] text-fg-2">This lead is closed. Ask your reviewer to reopen it if that was wrong.</p>
          )}
        </div>
      ) : null}
      {lead.stage === 'converted' ? (
        <Note className="mt-5" icon={<CircleCheck className="text-[#2DCBAF]" />}>
          <p className="text-white">Converted on {formatDate(lead.convertedAt)}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {lead.client ? <Link className="text-link transition-colors hover:text-white" href={`/app/clients/${lead.client.id}`}>Client: {lead.client.name}</Link> : null}
            {lead.deal ? <Link className="text-link transition-colors hover:text-white" href={`/app/orbit/deals/${lead.deal.id}`}>Deal: {lead.deal.title}</Link> : null}
          </p>
        </Note>
      ) : null}
    </OverviewCard>
  )
}
