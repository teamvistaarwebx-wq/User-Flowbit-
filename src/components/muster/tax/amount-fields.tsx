'use client'

import { FormField } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { DeclaredAmounts } from '@/modules/muster/tax/worksheet'

type Props = { prefix: 'declared' | 'verified'; values: DeclaredAmounts & { landlordName?: string } }

function Amount({ name, label, value, help }: { name: string; label: string; value: number; help?: string }) {
  return (
    <FormField name={name} label={label} help={help}>
      <Input id={name} name={name} inputMode="decimal" defaultValue={value ? String(value) : ''} placeholder="0" />
    </FormField>
  )
}

/** The investment and rent amounts, rupees a year (rent a month). Old-regime items are ignored in the new regime. */
export function AmountFields({ prefix, values }: Props) {
  const n = (key: string) => `${prefix}.${key}`
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Amount name={n('sec80c')} label="80C investments (₹ a year)" value={values.sec80c} help="PPF, ELSS, LIC, tuition fees, principal on a home loan. Employee PF is added for you." />
        <Amount name={n('sec80dSelf')} label="80D health insurance: self and family" value={values.sec80dSelf} />
        <Amount name={n('sec80dParents')} label="80D health insurance: parents" value={values.sec80dParents} />
        <Amount name={n('nps80ccd1b')} label="NPS 80CCD(1B) (₹ a year)" value={values.nps80ccd1b} />
        <Amount name={n('homeLoanInterest')} label="Home loan interest (₹ a year)" value={values.homeLoanInterest} help="Self-occupied house." />
        <Amount name={n('rentMonthly')} label="Rent paid (₹ a month)" value={values.rentMonthly} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox name={n('selfSenior')} defaultChecked={values.selfSenior} label="I or my spouse am a senior citizen" />
        <Checkbox name={n('parentsSenior')} defaultChecked={values.parentsSenior} label="My parents are senior citizens" />
        <Checkbox name={n('metro')} defaultChecked={values.metro} label="I rent in a metro city" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name={n('landlordName')} label="Landlord's name">
          <Input id={n('landlordName')} name={n('landlordName')} defaultValue={values.landlordName ?? ''} />
        </FormField>
        <FormField name={n('landlordPan')} label="Landlord's PAN" help="Needed when rent is above ₹1 lakh a year.">
          <Input id={n('landlordPan')} name={n('landlordPan')} defaultValue={values.landlordPan} maxLength={10} className="uppercase" />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Amount name={n('previousEmployer.taxableSalary')} label="Previous employer: taxable salary this year" value={values.previousEmployer.taxableSalary} help="Joined this year? From their Form 130 or 12B." />
        <Amount name={n('previousEmployer.tds')} label="Previous employer: TDS deducted" value={values.previousEmployer.tds} />
        <Amount name={n('previousEmployer.professionalTax')} label="Previous employer: professional tax" value={values.previousEmployer.professionalTax} />
      </div>
    </div>
  )
}
