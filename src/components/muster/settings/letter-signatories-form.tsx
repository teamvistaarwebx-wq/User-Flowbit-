'use client'

import Link from 'next/link'
import { FileSignature } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/input'
import { saveLetterSignatories } from '@/modules/muster/settings/letter-signatory-actions'

export type LetterTypeRow = { code: string; name: string; category: string }
export type SignerOption = { id: string; label: string }

/** The authorised signatory who signs each HR letter type by default (the issue form can still pick another). */
export function LetterSignatoriesForm({ letters, signers, chosen, defaultLabel, canWrite, canManageProfile }: { letters: LetterTypeRow[]; signers: SignerOption[]; chosen: Record<string, string>; defaultLabel: string | null; canWrite: boolean; canManageProfile: boolean }) {
  const options = [{ value: '', label: defaultLabel ? `Company default: ${defaultLabel}` : 'Company default (none yet)' }, ...signers.map((s) => ({ value: s.id, label: s.label }))]
  return (
    <ActionForm action={saveLetterSignatories}>
      <Card variant="solid">
        <CardHeader
          label="Letter signatories"
          icon={<FileSignature />}
          description="Who signs each letter type unless the letter picks someone else. The signature, name, designation and seal come from the company profile and are fixed on the letter when it is issued."
        />
        {signers.length === 0 ? (
          <p className="mb-4 text-[13px] text-fg-2">
            No authorised signatories yet. {canManageProfile ? <Link href="/app/settings/company" className="text-white underline underline-offset-2">Add them in the company profile</Link> : 'An owner or admin adds them in Settings → Company profile.'}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {letters.map((l) => (
            <FormField key={l.code} name={`signer.${l.code}`} label={l.name} help={l.category}>
              <NativeSelect id={`signer.${l.code}`} name={`signer.${l.code}`} defaultValue={chosen[l.code] ?? ''} options={options} disabled={!canWrite || signers.length === 0} />
            </FormField>
          ))}
        </div>
        {canWrite && signers.length ? <div className="mt-4 flex justify-end"><SubmitButton>Save letter signatories</SubmitButton></div> : null}
      </Card>
    </ActionForm>
  )
}
