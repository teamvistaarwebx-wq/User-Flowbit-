'use client'

import { BadgeCheck, Banknote, Calculator, CircleCheck, FileCheck, Lock, LockOpen, Mail, ReceiptText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ActionResult } from '@/lib/action-types'
import { advancePayrollStage, closeClaimCollection, generatePayrollMonth, publishPayrollPayslips, releaseSalaries, reopenPayroll } from '@/modules/muster/payroll/cycle-actions'
import { REOPENABLE, canCloseClaims, canGenerate, type PayrollStatus } from '@/modules/muster/payroll/stages'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'

export type StagePerms = { run: boolean; approve: boolean; lock: boolean; release: boolean; unlock: boolean }

type Props = { id: string; label: string; status: PayrollStatus; perms: StagePerms; attendanceLocked: boolean; statutoryBlocked: boolean; seesEveryone: boolean; today: string; netLabel: string }

/** Only the next step(s) of the month, each a confirmed action, shown to whoever may press it. */
export function StageControls({ id, label, status, perms, attendanceLocked, statutoryBlocked, seesEveryone, today, netLabel }: Props) {
  const [releaseOpen, setReleaseOpen] = useState(false)
  const router = useRouter()
  // A refused step (usually "the month moved on") re-renders the page, so the buttons match where the month really is.
  const refreshOnRefusal = async <T,>(pending: Promise<ActionResult<T>>) => {
    const result = await pending
    if (!result.ok) router.refresh()
    return result
  }
  const generated = status !== 'attendance_open' && status !== 'attendance_locked' && status !== 'reimbursements_closed'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {perms.run && canCloseClaims(status) ? (
        <ConfirmDialog
          trigger={<Button variant="secondary" icon={<ReceiptText className="size-4" />}>Close claim collection</Button>}
          title={`Close claim collection for ${label}?`}
          description="Claim forms paid with this month's salary stop taking claims. Approved claims can still be sent to this month until it is locked."
          confirmLabel="Close collection"
          tone="primary"
          onConfirm={() => refreshOnRefusal(closeClaimCollection({ id }))}
        />
      ) : null}
      {perms.run && seesEveryone && canGenerate(status) ? (
        attendanceLocked && !statutoryBlocked ? (
          <ConfirmDialog
            trigger={<Button variant={generated ? 'outline' : 'primary'} icon={<Calculator className="size-4" />}>{generated ? 'Regenerate' : 'Generate payroll'}</Button>}
            title={generated ? `Regenerate ${label} payroll?` : `Generate ${label} payroll?`}
            description={generated ? 'Every entry is recomputed from the locked attendance, current structures, adjustments, claims and holds. HR review and Finance approval are cleared.' : 'Each person’s pay is computed from the locked attendance, their salary structure, adjustments, scheduled claims and the statutory rates for the month.'}
            confirmLabel={generated ? 'Regenerate' : 'Generate'}
            tone="primary"
            onConfirm={() => refreshOnRefusal(generatePayrollMonth({ id }))}
          />
        ) : (
          <Button variant="secondary" icon={<Calculator className="size-4" />} disabled title={!attendanceLocked ? `Lock ${label} attendance first` : 'Confirm the statutory rates first'}>
            {generated ? 'Regenerate' : 'Generate payroll'}
          </Button>
        )
      ) : null}
      {perms.run && status === 'generated' ? (
        <ConfirmDialog
          trigger={<Button variant="primary" icon={<CircleCheck className="size-4" />}>Mark HR reviewed</Button>}
          title={`Mark ${label} HR reviewed?`}
          description="You have checked the register: attendance, adjustments, holds and new joiners. Finance approves next."
          confirmLabel="Mark reviewed"
          tone="primary"
          onConfirm={() => refreshOnRefusal(advancePayrollStage({ id, target: 'hr_reviewed' }))}
        />
      ) : null}
      {perms.approve && status === 'hr_reviewed' ? (
        <ConfirmDialog
          trigger={<Button variant="primary" icon={<BadgeCheck className="size-4" />}>Finance approve</Button>}
          title={`Approve ${label} payroll?`}
          description={`Confirm the salary register is correct. Net payable: ${netLabel}.`}
          confirmLabel="Approve"
          tone="primary"
          onConfirm={() => refreshOnRefusal(advancePayrollStage({ id, target: 'finance_approved' }))}
        />
      ) : null}
      {perms.lock && status === 'finance_approved' ? (
        <ConfirmDialog
          trigger={<Button variant="primary" icon={<Lock className="size-4" />}>Lock payroll</Button>}
          title={`Lock ${label} payroll?`}
          description="Every figure is frozen: no regeneration, adjustments, holds or claim scheduling until someone with unlock rights reopens it."
          confirmLabel="Lock"
          tone="primary"
          onConfirm={() => refreshOnRefusal(advancePayrollStage({ id, target: 'locked' }))}
        />
      ) : null}
      {perms.release && status === 'locked' ? (
        <Dialog
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          trigger={<Button variant="primary" icon={<Banknote className="size-4" />}>Mark salaries released</Button>}
          title={`Record the ${label} salary payment`}
          description={`Net payable ${netLabel}. Claims in this register are marked paid with it.`}
        >
          <ActionForm action={releaseSalaries} onDone={() => setReleaseOpen(false)} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <FormField name="paymentDate" label="Paid on" required>
              <DateInput id="paymentDate" name="paymentDate" defaultValue={today} max={today} />
            </FormField>
            <FormField name="paymentReference" label="Bank reference (UTR)" required>
              <Input id="paymentReference" name="paymentReference" placeholder="HDFCR52026100512345" />
            </FormField>
            <FormField name="paymentNotes" label="Notes">
              <Textarea id="paymentNotes" name="paymentNotes" rows={2} placeholder="Bulk transfer from the current account" />
            </FormField>
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      ) : null}
      {perms.release && (status === 'released' || status === 'payslips_published') ? (
        <ConfirmDialog
          trigger={<Button variant={status === 'released' ? 'primary' : 'outline'} icon={status === 'released' ? <FileCheck className="size-4" /> : <Mail className="size-4" />}>{status === 'released' ? 'Publish and email payslips' : 'Re-send payslips'}</Button>}
          title={status === 'released' ? `Publish ${label} payslips?` : `Re-send ${label} payslips?`}
          description="Each person gets their PDF payslip by email and can download it from My payslips. People on hold are skipped."
          confirmLabel={status === 'released' ? 'Publish' : 'Re-send'}
          tone="primary"
          onConfirm={() => refreshOnRefusal(publishPayrollPayslips({ id }))}
        />
      ) : null}
      {perms.unlock && REOPENABLE.includes(status) ? (
        <ConfirmDialog
          trigger={<Button variant="ghost" icon={<LockOpen className="size-4" />}>Reopen</Button>}
          title={`Reopen ${label} payroll?`}
          description="It goes back to Generated and must be reviewed, approved and locked again."
          confirmLabel="Reopen"
          reason={{ label: 'Why it is being reopened', required: true, placeholder: 'Two leave approvals were missed for Aditi Singh.' }}
          onConfirm={(reason) => refreshOnRefusal(reopenPayroll({ id, reason: reason ?? '' }))}
        />
      ) : null}
    </div>
  )
}
