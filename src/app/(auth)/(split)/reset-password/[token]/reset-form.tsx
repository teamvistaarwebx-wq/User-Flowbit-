'use client'

import { resetPasswordAction } from '@/lib/auth/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { authInput } from '../../../_components/auth-card'

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="space-y-[17px]" noRefresh>
      <input type="hidden" name="token" value={token} />
      <FormField name="password" label="New password" help="At least 8 characters with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" className={authInput} required />
      </FormField>
      <FormField name="confirm" label="Repeat new password">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" className={authInput} required />
      </FormField>
      <SubmitButton className="!mt-[29px] h-[54px] w-full text-base" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </ActionForm>
  )
}
