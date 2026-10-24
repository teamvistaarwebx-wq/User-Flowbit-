'use client'

import { CalendarClock, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { draftLetter } from '@/modules/muster/letters/actions'
import { CATEGORY_LABELS, LETTERS, isLetterApplicable, suggestedLetters, type LetterCategory, type LetterDefinition } from '@/modules/muster/letters/catalogue'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { SectionLabel } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'

type Person = { id: string; label: string; status: string; employmentType: string; statusLabel: string }

/** Pick a person, then a letter: the letters due for their status come first. */
export function NewLetterForm({ people, defaultEmployee, payCodes, canSeePay }: { people: Person[]; defaultEmployee?: string; payCodes: string[]; canSeePay: boolean }) {
  const [employeeId, setEmployeeId] = useState(defaultEmployee ?? '')
  const [code, setCode] = useState('')
  const person = people.find((p) => p.id === employeeId)
  const suggested = useMemo(() => (person ? suggestedLetters(person.status, person.employmentType) : []), [person])
  const rest = LETTERS.filter((l) => !suggested.includes(l) && (!person || isLetterApplicable(l, person.status, person.employmentType)))
  const groups = (Object.keys(CATEGORY_LABELS) as LetterCategory[]).map((c) => ({ c, letters: rest.filter((l) => l.category === c) })).filter((g) => g.letters.length)
  const pays = new Set(payCodes)

  const option = (l: LetterDefinition) => {
    const blocked = pays.has(l.code) && !canSeePay
    return (
      // Onboarding's option cards: grey glass with a translucent hairline; the chosen one takes the 3px white-to-orchid stroke.
      <label key={l.code} className={cn('relative flex cursor-pointer items-start gap-3 rounded-[12px] px-3 py-2.5 transition-[background-color,box-shadow] duration-150', code === l.code ? 'edge-selected bg-white/[0.09]' : 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.14] hover:bg-white/[0.07]', blocked && 'cursor-not-allowed opacity-50')}>
        <input type="radio" name="templateCode" value={l.code} checked={code === l.code} disabled={blocked} onChange={() => setCode(l.code)} className="mt-1 accent-[#BF74B4]" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-white">
            {l.name}
            {pays.has(l.code) ? <Lock className="size-3 text-fg-2" aria-label="States pay" /> : null}
          </span>
          <span className="block text-xs text-fg-2">{blocked ? 'States pay: needs payroll access.' : l.purpose}</span>
        </span>
      </label>
    )
  }

  return (
    <ActionForm action={draftLetter} className="space-y-5">
      <FormField name="employeeId" label="Who is it for" required>
        <NativeSelect id="employeeId" name="employeeId" options={people.map((p) => ({ value: p.id, label: `${p.label} · ${p.statusLabel}` }))} placeholder="Choose a person" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
      </FormField>
      <FormField name="templateCode" label="Letter" required>
        <div className="space-y-4">
          {suggested.length ? (
            <div>
              <SectionLabel icon={<CalendarClock />} className="mb-2">Due for {person?.statusLabel.toLowerCase()}</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2">{suggested.map(option)}</div>
            </div>
          ) : null}
          {groups.map((g) => (
            <div key={g.c}>
              <SectionLabel className="mb-2">{CATEGORY_LABELS[g.c]}</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2">{g.letters.map(option)}</div>
            </div>
          ))}
        </div>
      </FormField>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Drafting…" disabled={!employeeId || !code}>
          Draft letter
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
