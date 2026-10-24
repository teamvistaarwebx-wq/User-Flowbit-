'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { saveTaxYearSettings } from '@/modules/muster/tax/actions'

type Values = { declarationsOpen: boolean; proofOpens: string; proofCloses: string; tan: string; signatoryName: string; signatoryDesignation: string; signatoryPlace: string }
/** An authorised signatory from the company profile. */
export type TaxSigner = { id: string; name: string; designation: string }

const DEFAULT = 'default'
const OTHER = 'other'

/** Which choice the saved signer is: the company default (blank), one of the profile's signatories, or someone else. */
function initialChoice(values: Values, signers: readonly TaxSigner[]): string {
  if (!values.signatoryName) return DEFAULT
  return signers.find((s) => s.name === values.signatoryName)?.id ?? OTHER
}

/**
 * The year's declaration switch, proof window, TAN and Form 130 signatory. The signatory is picked from the
 * company profile (the one list of signatories); "Someone else" is a labelled override for this year only.
 */
export function YearSettingsForm({ fy, values, signers, defaultLabel, canEditProfile }: { fy: string; values: Values; signers: readonly TaxSigner[]; defaultLabel: string | null; canEditProfile: boolean }) {
  const [choice, setChoice] = useState(() => initialChoice(values, signers))
  const picked = signers.find((s) => s.id === choice)
  const options = [
    { value: DEFAULT, label: defaultLabel ? `Company default: ${defaultLabel}` : 'Company default signatory' },
    ...signers.map((s) => ({ value: s.id, label: `${s.name}, ${s.designation}` })),
    { value: OTHER, label: 'Someone else (override for this year)' },
  ]
  return (
    <ActionForm action={saveTaxYearSettings} className="space-y-4">
      <input type="hidden" name="fy" value={fy} />
      <Checkbox name="declarationsOpen" defaultChecked={values.declarationsOpen} label="Employees may change their regime and declaration" />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField name="proofOpens" label="Proof window opens"><DateInput id="proofOpens" name="proofOpens" defaultValue={values.proofOpens} /></FormField>
        <FormField name="proofCloses" label="Proof window closes"><DateInput id="proofCloses" name="proofCloses" defaultValue={values.proofCloses} /></FormField>
        <FormField name="tan" label="TAN"><Input id="tan" name="tan" defaultValue={values.tan} maxLength={10} className="uppercase" /></FormField>
        <FormField
          name="signatoryChoice"
          label="Form 130 signed by"
          className="sm:col-span-3"
          help={
            <>
              Picked from the authorised signatories in the company profile; their signature prints on Form 130.
              {canEditProfile ? <> <Link href="/app/settings/company" className="text-fg underline-offset-2 hover:underline">Edit in Company profile</Link></> : null}
            </>
          }
        >
          <Select id="signatoryChoice" aria-label="Form 130 signed by" value={choice} onValueChange={setChoice} options={options} />
        </FormField>
        {choice === OTHER ? (
          <>
            <FormField name="signatoryName" label="Name (override)"><Input id="signatoryName" name="signatoryName" defaultValue={values.signatoryName} required /></FormField>
            <FormField name="signatoryDesignation" label="Designation (override)"><Input id="signatoryDesignation" name="signatoryDesignation" defaultValue={values.signatoryDesignation} /></FormField>
          </>
        ) : (
          <>
            <input type="hidden" name="signatoryName" value={picked?.name ?? ''} />
            <input type="hidden" name="signatoryDesignation" value={picked?.designation ?? ''} />
          </>
        )}
        <FormField name="signatoryPlace" label="Place"><Input id="signatoryPlace" name="signatoryPlace" defaultValue={values.signatoryPlace} /></FormField>
      </div>
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  )
}
