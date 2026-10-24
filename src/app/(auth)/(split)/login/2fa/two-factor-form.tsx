'use client'

import { ArrowRight } from 'lucide-react'
import { verifyTwoFactorAction } from '@/lib/auth/two-factor-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { authInput } from '../../../_components/auth-card'

export function TwoFactorForm({ rememberDays }: { rememberDays: number }) {
  return (
    <ActionForm action={verifyTwoFactorAction} noRefresh>
      <FormField name="code" label="Code">
        <Input id="code" name="code" inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={20} className={authInput} />
      </FormField>
      <FormField name="remember" className="mt-[19px]">
        <Checkbox name="remember" label={`Remember this device for ${rememberDays} days`} />
      </FormField>
      <SubmitButton className="mt-6 h-[54px] w-full text-base" pendingLabel="Checking…" iconRight={<ArrowRight className="size-4" strokeWidth={1.5} />}>
        Verify and sign in
      </SubmitButton>
    </ActionForm>
  )
}
