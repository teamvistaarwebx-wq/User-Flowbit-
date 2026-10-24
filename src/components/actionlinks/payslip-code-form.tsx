'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { sendPayslipCodeAction, verifyPayslipCodeAction } from '@/modules/muster/payroll/payslip-link-actions'

/** Step 1: send a code to the work email. Step 2: type it; the page then offers the PDF. */
export function PayslipCodeForm({ token, emailHint }: { token: string; emailHint: string }) {
  const [sent, setSent] = useState(false)
  if (!sent) {
    return (
      <ActionForm action={sendPayslipCodeAction} noRefresh onDone={() => setSent(true)} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-white/80">We will email a 6-digit code to {emailHint}.</p>
        <SubmitButton pendingLabel="Sending…">Send me a code</SubmitButton>
      </ActionForm>
    )
  }
  return (
    <ActionForm action={verifyPayslipCodeAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormField name="code" label={`Code sent to ${emailHint}`} required>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
      </FormField>
      <SubmitButton pendingLabel="Checking…">Open payslip</SubmitButton>
    </ActionForm>
  )
}
