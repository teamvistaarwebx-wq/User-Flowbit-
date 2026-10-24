'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { loseDeal, winDeal } from '@/modules/orbit/deals.actions'
import { moveLeadStage } from '@/modules/orbit/lead-stage.actions'
import type { LeadStage } from '@/modules/orbit/constants'
import type { Option } from '@/modules/orbit/record-types'
import { Note } from './parts'

type Controlled = { open?: boolean; onOpenChange?: (open: boolean) => void; trigger?: ReactNode }

/** Open state that works controlled (board drops) or uncontrolled (buttons). */
function useOpen(p: Controlled) {
  const [inner, setInner] = useState(false)
  const open = p.open ?? inner
  const set = (v: boolean) => {
    if (p.open === undefined) setInner(v)
    p.onOpenChange?.(v)
  }
  return [open, set] as const
}

type LeadRef = { id: string; stage: LeadStage; companyName: string }

const Callout = ({ children }: { children: ReactNode }) => <Note>{children}</Note>

const Hidden = ({ values }: { values: Record<string, string> }) => <>{Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>

/** Meeting booked: date (required), time, link. */
export function MeetingDialog({ lead, today, ...p }: Controlled & { lead: LeadRef; today: string }) {
  const [open, setOpen] = useOpen(p)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={p.trigger} title="Meeting booked" description={`When are you meeting ${lead.companyName}?`} size="md">
      <ActionForm action={moveLeadStage} className="space-y-4" onDone={() => setOpen(false)}>
        <Hidden values={{ id: lead.id, fromStage: lead.stage, toStage: 'meeting_booked' }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="meetingDate" label="Date" required><DateInput id="meetingDate" name="meetingDate" min={today} defaultValue={today} /></FormField>
          <FormField name="meetingTime" label="Time"><DateInput id="meetingTime" name="meetingTime" type="time" defaultValue="11:00" /></FormField>
        </div>
        <FormField name="meetingLink" label="Meeting link"><Input id="meetingLink" name="meetingLink" placeholder="https://meet.google.com/…" /></FormField>
        <Callout>The meeting goes on the follow-up queue. Mark it done with notes after it happens.</Callout>
        <div className="flex justify-end"><SubmitButton pendingLabel="Booking…">Mark meeting booked</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Meeting done: logs the meeting notes (required) and moves the stage. */
export function LogMeetingDialog({ lead, ...p }: Controlled & { lead: LeadRef }) {
  const [open, setOpen] = useOpen(p)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={p.trigger} title="Log the meeting" description={`What was discussed with ${lead.companyName}?`} size="md">
      <ActionForm action={moveLeadStage} className="space-y-4" onDone={() => setOpen(false)}>
        <Hidden values={{ id: lead.id, fromStage: lead.stage, toStage: 'meeting_done' }} />
        <FormField name="meetingNotes" label="Notes" required>
          <Textarea id="meetingNotes" name="meetingNotes" rows={5} maxLength={4000} placeholder="Needs, budget, decision makers, next steps" />
        </FormField>
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Mark meeting done</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Lost / disqualified (lead) or lost (deal): a reason code is mandatory. */
export function ReasonDialog({ target, reasons, ...p }: Controlled & { reasons: Option[]; target: { kind: 'lead'; lead: LeadRef; to: 'lost' | 'disqualified' } | { kind: 'deal'; id: string; title: string } }) {
  const [open, setOpen] = useOpen(p)
  const word = target.kind === 'lead' ? target.to : 'lost'
  const action = target.kind === 'lead' ? moveLeadStage : loseDeal
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={p.trigger} title={`Why is this ${word}?`} description={target.kind === 'lead' ? target.lead.companyName : target.title} size="md">
      <ActionForm action={action} className="space-y-4" onDone={() => setOpen(false)}>
        {target.kind === 'lead' ? <Hidden values={{ id: target.lead.id, fromStage: target.lead.stage, toStage: target.to }} /> : <Hidden values={{ id: target.id }} />}
        <FormField name="reasonCode" label="Reason" required><Select id="reasonCode" name="reasonCode" options={reasons} placeholder="Pick the closest reason" /></FormField>
        <FormField name="reasonNote" label="Detail" help="Required for 'Other'"><Textarea id="reasonNote" name="reasonNote" rows={3} maxLength={300} placeholder="Said budget opens again in Q3, told me to ping in April." /></FormField>
        <Callout>A reason code is mandatory. Free text alone makes loss analysis impossible later, so pick the closest bucket first.</Callout>
        <div className="flex justify-end"><SubmitButton variant="danger" pendingLabel="Saving…">Mark {word}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Won: confirm the final value, optional won reason and close date. */
export function WonDialog({ deal, reasons, today, ...p }: Controlled & { deal: { id: string; title: string; valuePaise: number }; reasons: Option[]; today: string }) {
  const [open, setOpen] = useOpen(p)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={p.trigger} title="Mark deal won" description={deal.title} size="md">
      <ActionForm action={winDeal} className="space-y-4" onDone={() => setOpen(false)}>
        <input type="hidden" name="id" value={deal.id} />
        <FormField name="valueRupees" label="Final value (₹)" required><Input id="valueRupees" name="valueRupees" inputMode="decimal" defaultValue={String(deal.valuePaise / 100)} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="wonReason" label="Why we won"><Select id="wonReason" name="wonReason" options={reasons} placeholder="Optional" /></FormField>
          <FormField name="closeDate" label="Close date"><DateInput id="closeDate" name="closeDate" max={today} defaultValue={today} /></FormField>
        </div>
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Mark won</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
