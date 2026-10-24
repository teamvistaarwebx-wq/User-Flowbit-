'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { confirmActionLinkAction } from '@/modules/actionlinks/public-actions'
import type { ActionChoice, NoteRule } from '@/modules/actionlinks/kinds'

export type ChoiceOption = Readonly<{ choice: ActionChoice; label: string }>

/**
 * The confirmation step of an emailed Approve / Reject link: nothing happens
 * until the person presses a button here, so mail scanners that open links
 * cannot decide anything. A rejection asks for the note the app asks for.
 */
export function DecideForm({ token, options, initial, rejectNote, noteMin }: { token: string; options: readonly ChoiceOption[]; initial: ActionChoice | null; rejectNote: NoteRule; noteMin: number }) {
  const [choice, setChoice] = useState<ActionChoice | null>(initial && options.some((o) => o.choice === initial) ? initial : null)
  const [done, setDone] = useState<string | null>(null)
  if (done) {
    return (
      <p className="flex items-start gap-2 text-sm text-white">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> {done}
      </p>
    )
  }
  if (!choice) {
    return (
      <div className="flex flex-wrap gap-3">
        {options.map((o, i) =>
          i === 0 ? (
            <button key={o.choice} type="button" onClick={() => setChoice(o.choice)} className="press inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold transition-opacity hover:opacity-90" style={{ background: 'var(--doc-brand)', color: 'var(--doc-ink)' }}>
              {o.label}
            </button>
          ) : (
            <Button key={o.choice} variant="secondary" size="lg" onClick={() => setChoice(o.choice)}>
              {o.label}
            </Button>
          ),
        )}
      </div>
    )
  }
  const label = options.find((o) => o.choice === choice)?.label ?? 'Confirm'
  const needsNote = choice === 'reject' && rejectNote !== 'none'
  return (
    <ActionForm action={confirmActionLinkAction} className="space-y-4" noRefresh onDone={(result) => setDone(result.message ?? 'Done.')}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="choice" value={choice} />
      {needsNote ? (
        <FormField name="note" label={rejectNote === 'required' ? 'Why? (they see this note)' : 'Note (optional)'} required={rejectNote === 'required'}>
          <Textarea id="note" name="note" rows={3} maxLength={500} minLength={rejectNote === 'required' ? noteMin : undefined} required={rejectNote === 'required'} />
        </FormField>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Saving…">{`Confirm: ${label}`}</SubmitButton>
        <Button variant="ghost" onClick={() => setChoice(null)}>
          Back
        </Button>
      </div>
    </ActionForm>
  )
}
