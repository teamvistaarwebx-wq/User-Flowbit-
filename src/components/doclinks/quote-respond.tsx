'use client'

import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { respondToQuoteAction } from '@/modules/doclinks/public-actions'

/** Accept (typed name as signature, optional comment) or decline a quote on its public page. */
export function QuoteRespond({ token }: { token: string }) {
  const [decision, setDecision] = useState<'accept' | 'decline' | null>(null)
  if (!decision) {
    return (
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setDecision('accept')} className="press inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold transition-opacity hover:opacity-90" style={{ background: 'var(--doc-brand)', color: 'var(--doc-ink)' }}>
          Accept quote
        </button>
        <Button variant="secondary" size="lg" onClick={() => setDecision('decline')}>
          Decline
        </Button>
      </div>
    )
  }
  const accepting = decision === 'accept'
  return (
    <ActionForm action={respondToQuoteAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="decision" value={decision} />
      <FormField name="name" label={accepting ? 'Your full name (as your signature)' : 'Your name'} required>
        <Input id="name" name="name" autoComplete="name" maxLength={120} required />
      </FormField>
      <FormField name="comment" label={accepting ? 'Comment (optional)' : 'Reason (optional)'}>
        <Textarea id="comment" name="comment" rows={3} maxLength={1000} />
      </FormField>
      {accepting ? <p className="text-xs text-white/60">By accepting you agree to this quote. Your name, the time and your IP address are recorded.</p> : null}
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel={accepting ? 'Accepting…' : 'Sending…'}>{accepting ? 'Accept quote' : 'Decline quote'}</SubmitButton>
        <Button variant="ghost" onClick={() => setDecision(null)}>
          Back
        </Button>
      </div>
    </ActionForm>
  )
}
