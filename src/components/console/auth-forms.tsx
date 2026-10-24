'use client'

import { useState } from 'react'
import { ArrowRight, Copy, KeyRound } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { completeStaffSetupAction, confirmEnrolmentAction, staffSignInAction, verifyStaffCodeAction } from '@/modules/console/auth-actions'

/** Console sign-in steps: password, code, enrolment (shows recovery codes once) and the setup link. */

export function StaffSignInForm({ next }: { next?: string }) {
  return (
    <ActionForm action={staffSignInAction} noRefresh className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField name="email" label="Work email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </FormField>
      <FormField name="password" label="Console password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <SubmitButton className="w-full" pendingLabel="Checking…" iconRight={<ArrowRight className="size-4" strokeWidth={1.5} />}>Continue</SubmitButton>
    </ActionForm>
  )
}

export function StaffCodeForm({ next }: { next?: string }) {
  return (
    <ActionForm action={verifyStaffCodeAction} noRefresh className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField name="code" label="6-digit code" help="From your authenticator app. Lost your phone? Enter a recovery code instead.">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={20} />
      </FormField>
      <SubmitButton className="w-full" pendingLabel="Checking…" icon={<KeyRound className="size-4" strokeWidth={1.5} />}>Sign in</SubmitButton>
    </ActionForm>
  )
}

export function EnrolForm({ next }: { next: string }) {
  const [codes, setCodes] = useState<string[] | null>(null)
  if (codes) {
    const copy = async () => {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Recovery codes copied')
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-fg-2">Save these recovery codes somewhere safe (a password manager). Each works once if you lose your phone. They are not shown again.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-[10px] bg-white/[0.04] p-3 font-mono text-sm text-white">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Copy className="size-4" />} onClick={copy}>Copy codes</Button>
          <Button href={next} iconRight={<ArrowRight className="size-4" />}>I saved them, open the Console</Button>
        </div>
      </div>
    )
  }
  return (
    <ActionForm action={confirmEnrolmentAction} noRefresh onDone={(r) => setCodes(r.data?.codes ?? [])} className="space-y-4">
      <FormField name="code" label="Code from the app" help="Scan the QR code, then type the 6 digits your app shows.">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} />
      </FormField>
      <SubmitButton className="w-full" pendingLabel="Checking…">Turn on two-factor sign-in</SubmitButton>
    </ActionForm>
  )
}

export function StaffSetupForm({ token }: { token: string }) {
  return (
    <ActionForm action={completeStaffSetupAction} noRefresh className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormField name="password" label="New Console password" help="At least 8 characters with a letter and a number. Use a different one from your Flowbit app password.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </FormField>
      <FormField name="confirm" label="Repeat it">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </FormField>
      <SubmitButton className="w-full" pendingLabel="Saving…">Save password</SubmitButton>
    </ActionForm>
  )
}
