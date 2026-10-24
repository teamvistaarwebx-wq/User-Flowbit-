'use client'

import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { forgotPasswordAction } from '@/lib/auth/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { authInput } from '../../_components/auth-card'

export function ForgotForm() {
  const [sent, setSent] = useState(false)
  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center animate-fade-in">
        <MailCheck className="size-8 text-fg" strokeWidth={1.25} />
        <p className="text-sm text-fg">Check your inbox for a link to choose a new password. It works for 60 minutes.</p>
      </div>
    )
  }
  return (
    <ActionForm action={forgotPasswordAction} onDone={() => setSent(true)} noRefresh>
      <FormField name="email" label="Email Address">
        <Input id="email" name="email" type="email" autoComplete="email" className={authInput} required />
      </FormField>
      <SubmitButton className="mt-[29px] h-[54px] w-full text-base" pendingLabel="Sending link…">
        Send reset link
      </SubmitButton>
    </ActionForm>
  )
}
