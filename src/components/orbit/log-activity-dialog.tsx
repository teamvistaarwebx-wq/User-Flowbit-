'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { ChipGroup } from '@/components/ui/chip-group'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { logActivity } from '@/modules/orbit/activities.actions'
import { ACTIVITY_LABEL, ACTIVITY_TYPES, CHANNELS, CHANNEL_LABEL, LEAD_STAGE_LABEL, defaultChannel, type ActivityType, type LeadStage } from '@/modules/orbit/constants'
import { moveLeadStage } from '@/modules/orbit/lead-stage.actions'
import type { RecordHit, RecordKind } from '@/modules/orbit/record-types'
import { Note } from './parts'
import { RecordFields, RecordPicker } from './record-picker'
import { istLocalInput, occurredBounds } from './time'

export type RelatedRef = { leadId?: string; dealId?: string; clientId?: string; contactId?: string }

export type LogActivityDialogProps = {
  trigger: ReactNode
  /** Fixed related record; omit to let the user pick one. */
  related?: RelatedRef
  pickKinds?: RecordKind[]
  /** Lead context for the "Move to …" offer and channel defaults. */
  lead?: { id: string; stage: LeadStage; source: string }
  defaultType?: ActivityType
  today: string
}

/** Log a done activity (DM, email, call, follow-up, reply, meeting, note), optionally scheduling the next step. */
export function LogActivityDialog({ trigger, related, pickKinds = ['lead', 'deal', 'client'], lead, defaultType = 'dm', today }: LogActivityDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>(defaultType)
  const [channel, setChannel] = useState<string>(defaultChannel(defaultType, lead?.source))
  const [follow, setFollow] = useState(false)
  const [hit, setHit] = useState<RecordHit | null>(null)
  const bounds = occurredBounds()

  const pickType = (t: string) => {
    setType(t as ActivityType)
    setChannel(defaultChannel(t as ActivityType, lead?.source))
  }

  const offerMove = (to: LeadStage) => {
    if (!lead) return
    toast.info(`Ready for ${LEAD_STAGE_LABEL[to]}`, {
      action: {
        label: `Move to ${LEAD_STAGE_LABEL[to]}`,
        onClick: async () => {
          const res = await moveLeadStage({ id: lead.id, fromStage: lead.stage, toStage: to })
          if (res.ok) toast.success(res.message ?? `Moved to ${LEAD_STAGE_LABEL[to]}`)
          else toast.error(res.error)
          router.refresh()
        },
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="Log activity" description="What happened, on which channel, and what was said." size="lg">
      <ActionForm
        action={logActivity}
        className="space-y-4"
        onDone={(result) => {
          setOpen(false)
          setHit(null)
          const unlocks = (result.data as { unlocks?: LeadStage | null } | undefined)?.unlocks
          if (unlocks) offerMove(unlocks)
        }}
      >
        {related ? Object.entries(related).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null)) : null}
        {!related ? (
          <FormField name="leadId" label="Related to" required>
            <RecordPicker kinds={pickKinds} value={hit} onChange={setHit} name="leadId" />
            <RecordFields hit={hit} />
          </FormField>
        ) : null}
        <FormField name="type" label="What happened" required>
          <ChipGroup name="type" value={type} onValueChange={pickType} options={ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_LABEL[t] }))} size="sm" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="channel" label="Channel">
            <Select id="channel" name="channel" value={channel} onValueChange={setChannel} options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
          </FormField>
          <FormField name="occurredAt" label="When" help="Up to 7 days back">
            <DateInput id="occurredAt" name="occurredAt" type="datetime-local" defaultValue={istLocalInput()} min={bounds.min} max={bounds.max} />
          </FormField>
        </div>
        <FormField name="notes" label="Notes" required={type === 'meeting'}>
          <Textarea id="notes" name="notes" rows={4} maxLength={4000} placeholder={type === 'meeting' ? 'Add what was discussed' : 'What did you say, what did they say back'} />
        </FormField>
        {type === 'reply' ? (
          <Note>
            Logging a reply unlocks the <span className="text-white">Engaged</span> stage. Engaged is the denominator for the warm target, so only log this when a human actually responded.
          </Note>
        ) : null}
        <button type="button" onClick={() => setFollow((v) => !v)} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-white transition-opacity hover:opacity-75" aria-expanded={follow}>
          <ChevronDown className={cn('size-4 transition-transform', follow && 'rotate-180')} /> Also schedule a follow-up
        </button>
        {follow ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="followUp.title" label="Next step"><Input id="followUp.title" name="followUp.title" placeholder="Send the deck" maxLength={140} /></FormField>
            <FormField name="followUp.dueDate" label="Due"><DateInput id="followUp.dueDate" name="followUp.dueDate" min={today} /></FormField>
            <input type="hidden" name="followUp.type" value="follow_up" />
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <SubmitButton pendingLabel="Logging…">Log activity</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
