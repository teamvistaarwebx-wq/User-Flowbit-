'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { loginAction } from '@/lib/auth/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { authInput } from '../../_components/auth-card'
import { TermsLabel } from '../../_components/terms-label'

export function LoginForm({ next, invite, email }: { next?: string; invite?: string; email?: string }) {
  return (
    <ActionForm action={loginAction} noRefresh>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      <div className="space-y-[18px] lg:space-y-[17px]">
        <FormField name="email" label="Email Address">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} className={authInput} required />
        </FormField>
        <div className="relative">
          <FormField name="password" label="Password">
            <Input id="password" name="password" type="password" autoComplete="current-password" className={authInput} required />
          </FormField>
          {/* Sits on the label row so the terms line below gets the full width. */}
          <Link href="/forgot-password" className="absolute right-1 top-0 text-sm text-link transition-colors hover:text-blush">
            Forgot password?
          </Link>
        </div>
      </div>
      <FormField name="terms" className="mt-[19px] lg:mt-[19px]">
        <Checkbox name="terms" defaultChecked label={<TermsLabel action="signing in" />} />
      </FormField>
      <SubmitButton className="mt-6 h-[54px] w-full text-base" pendingLabel="Signing in…" iconRight={<ArrowRight className="size-4" strokeWidth={1.5} />}>
        Sign in
      </SubmitButton>
    </ActionForm>
  )
}
