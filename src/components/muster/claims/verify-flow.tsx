'use client'

import { ArrowRight, KeyRound, Mail } from 'lucide-react'
import { useState } from 'react'
import { continueAsLinkedEmployee, requestClaimOtp, verifyClaimOtp } from '@/modules/muster/claims/public-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Step 1: work email → a six digit code is emailed. Step 2: the code → a one-hour session on this form.
 * Someone signed in to Flowbit and linked to their employee record skips both (`linked`).
 */
export function VerifyFlow({ slug, linked }: { slug: string; linked?: { name: string; email: string } | null }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [useEmail, setUseEmail] = useState(false)
  if (linked && !useEmail) {
    return (
      <div className="space-y-3">
        <ActionForm action={continueAsLinkedEmployee} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <p className="text-sm text-white/70">You are signed in to Flowbit as {linked.name}{linked.email ? ` (${linked.email})` : ''}.</p>
          <SubmitButton iconRight={<ArrowRight className="size-4" />} pendingLabel="Opening…" className="w-full">
            Continue as {linked.name}
          </SubmitButton>
        </ActionForm>
        <Button variant="ghost" size="sm" onClick={() => setUseEmail(true)}>Use a work email code instead</Button>
      </div>
    )
  }
  if (!sent) {
    return (
      <ActionForm action={requestClaimOtp} onDone={() => setSent(true)} noRefresh className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        <FormField name="email" label="Your work email" required help="We email a six digit code to check it is you.">
          <Input id="email" name="email" type="email" autoComplete="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.in" autoFocus />
        </FormField>
        <SubmitButton iconRight={<ArrowRight className="size-4" />} pendingLabel="Sending…" className="w-full">
          Send my code
        </SubmitButton>
      </ActionForm>
    )
  }
  return (
    <ActionForm action={verifyClaimOtp} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="email" value={email} />
      <FormField name="code" label={`Code sent to ${email}`} required help="It lasts 10 minutes.">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} icon={<KeyRound />} placeholder="123456" className="tracking-[0.4em]" autoFocus />
      </FormField>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton pendingLabel="Checking…" className="flex-1">
          Verify
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setSent(false)}>
          Use another email
        </Button>
      </div>
    </ActionForm>
  )
}
