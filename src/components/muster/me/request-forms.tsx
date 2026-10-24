'use client'

import { CalendarPlus, MessageSquareWarning, Send, Undo2 } from 'lucide-react'
import { LeavePreview } from '@/components/muster/leave/leave-preview'
import { useState } from 'react'
import { requestAttendanceCorrection } from '@/modules/muster/attendance/correction-actions'
import { cancelLeaveRequest, applyForLeave } from '@/modules/muster/leave/actions'
import { raiseCompOff } from '@/modules/muster/leave/compoff-actions'
import { askHrToCorrect } from '@/modules/muster/me/actions'
import { CORRECTABLE_FIELDS } from '@/modules/muster/me/details'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { MAX_UPLOAD_LABEL } from '@/lib/upload-limit'
import { useT } from '@/components/shell/use-t'

/** Ask HR to correct something only HR can change (name, designation, dates…). */
export function AskHrForm() {
  const t = useT()
  return (
    <ActionForm action={askHrToCorrect} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
      <FormField name="field" label={t('form.askWhat')} required>
        <NativeSelect id="field" name="field" options={CORRECTABLE_FIELDS.map((f) => ({ value: f, label: f }))} placeholder={t('common.choose')} />
      </FormField>
      <FormField name="correction" label={t('form.askShould')} required className="sm:col-span-2">
        <Input id="correction" name="correction" placeholder="My joining date is 1 Apr 2025, not 4 Apr 2025" />
      </FormField>
      <div className="flex justify-end sm:col-span-3">
        <SubmitButton variant="secondary" icon={<MessageSquareWarning className="size-4" />} pendingLabel={t('common.sending')}>
          {t('form.askSend')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

/** Ask for a day to be corrected (present, on duty or half day); routed to the manager, then HR. */
export function CorrectionForm({ statuses, today, hint, defaultDate }: { statuses: { value: string; label: string }[]; today: string; hint: string; defaultDate?: string }) {
  const t = useT()
  return (
    <ActionForm action={requestAttendanceCorrection} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <FormField name="date" label={t('att.correction.day')} required help={hint}>
        <DateInput id="date" name="date" max={today} defaultValue={defaultDate} />
      </FormField>
      <FormField name="requestedStatus" label={t('att.correction.should')} required>
        <NativeSelect id="requestedStatus" name="requestedStatus" options={statuses} placeholder={t('common.choose')} />
      </FormField>
      <FormField name="reason" label={t('att.correction.reason')} required className="sm:col-span-2">
        <Textarea id="reason" name="reason" rows={2} placeholder="I was at the client's office in Bhopal all day and could not check in." />
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton icon={<Send className="size-4" />} pendingLabel={t('common.sending')}>
          {t('att.correction.submit')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

/** Claim a comp-off for working a weekly off or holiday (the day must already be marked). */
export function CompOffForm({ today }: { today: string }) {
  const t = useT()
  return (
    <ActionForm action={raiseCompOff} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
      <FormField name="workedOn" label={t('att.compoff.day')} required>
        <DateInput id="workedOn" name="workedOn" max={today} />
      </FormField>
      <FormField name="reason" label={t('att.compoff.why')} className="sm:col-span-2" htmlFor="compOffReason">
        <Input id="compOffReason" name="reason" placeholder="Release support for the Sharma Organics launch" />
      </FormField>
      <div className="flex justify-end sm:col-span-3">
        <SubmitButton variant="secondary" icon={<CalendarPlus className="size-4" />}>
          {t('att.compoff.submit')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

type LeaveTypeOption = { value: string; label: string; allowHalfDay: boolean }

/** Apply for leave; the balance split (paid / loss of pay) is worked out and shown in the confirmation. */
export function LeaveApplyForm({ types, today }: { types: LeaveTypeOption[]; today: string }) {
  const t = useT()
  const [typeId, setTypeId] = useState('')
  const [half, setHalf] = useState(false)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const type = types.find((t) => t.value === typeId)
  return (
    <ActionForm action={applyForLeave} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <FormField name="leaveTypeId" label={t('leave.type')} required className="sm:col-span-2">
        <NativeSelect id="leaveTypeId" name="leaveTypeId" options={types} placeholder={t('leave.chooseType')} value={typeId} onChange={(e) => setTypeId(e.target.value)} />
      </FormField>
      <FormField name="startDate" label={t('leave.from')} required>
        <DateInput id="startDate" name="startDate" defaultValue={today} onChange={(e) => setStart(e.target.value)} />
      </FormField>
      <FormField name="endDate" label={t('leave.to')} required>
        <DateInput id="endDate" name="endDate" defaultValue={today} onChange={(e) => setEnd(e.target.value)} />
      </FormField>
      {type?.allowHalfDay !== false ? (
        <div className="sm:col-span-2">
          <Switch name="isHalfDay" checked={half} onCheckedChange={setHalf} label={t('leave.halfDay')} description={t('leave.halfDayHint')} />
        </div>
      ) : null}
      {half && type?.allowHalfDay !== false ? (
        <FormField name="halfDaySession" label={t('leave.session')} className="sm:col-span-2">
          <NativeSelect id="halfDaySession" name="halfDaySession" options={[{ value: 'first', label: t('leave.session.first') }, { value: 'second', label: t('leave.session.second') }]} defaultValue="first" />
        </FormField>
      ) : null}
      <LeavePreview leaveTypeId={typeId} startDate={start} endDate={half ? start : end} isHalfDay={half} />
      <FormField name="reason" label={t('leave.reason')} required className="sm:col-span-2">
        <Textarea id="reason" name="reason" rows={2} placeholder={t('leave.reasonHint')} />
      </FormField>
      <FormField name="attachment" label={t('leave.proof')} className="sm:col-span-2">
        <FileUpload name="attachment" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" hint={t('leave.proofHint', { size: MAX_UPLOAD_LABEL })} />
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton icon={<Send className="size-4" />} pendingLabel={t('leave.applying')}>
          {t('leave.apply')}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

export function WithdrawLeave({ id, label }: { id: string; label: string }) {
  const t = useT()
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />}>{t('leave.withdraw')}</Button>}
      title={t('leave.withdrawTitle')}
      description={t('leave.withdrawBody', { label })}
      confirmLabel={t('leave.withdraw')}
      onConfirm={() => cancelLeaveRequest({ id })}
    />
  )
}
