'use client'

import { ArrowRight } from 'lucide-react'
import { signupAction } from '@/lib/auth/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { authInput } from '../../_components/auth-card'
import { TermsLabel } from '../../_components/terms-label'

export function SignupForm({ invite, email, planIntent }: { invite?: string; email?: string; planIntent?: string }) {
  return (
    <ActionForm action={signupAction} noRefresh>
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      {planIntent ? <input type="hidden" name="planIntent" value={planIntent} /> : null}
      <div className="space-y-[17px]">
        <FormField name="name" label="Your name">
          <Input id="name" name="name" autoComplete="name" className={authInput} required />
        </FormField>
        <FormField name="email" label="Work email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} readOnly={Boolean(invite && email)} className={authInput} required />
        </FormField>
        <FormField name="password" label="Password" help="At least 8 characters with a letter and a number.">
          <Input id="password" name="password" type="password" autoComplete="new-password" className={authInput} required />
        </FormField>
      </div>
      <FormField name="terms" className="mt-[19px]">
        <Checkbox name="terms" label={<TermsLabel action="creating an account" />} />
      </FormField>
      <SubmitButton className="mt-6 h-[54px] w-full text-base" pendingLabel="Creating account…" iconRight={<ArrowRight className="size-4" strokeWidth={1.5} />}>
        Create account
      </SubmitButton>
    </ActionForm>
  )
}
