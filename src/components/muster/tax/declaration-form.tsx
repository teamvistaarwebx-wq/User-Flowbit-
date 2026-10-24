'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { NativeSelect } from '@/components/ui/input'
import { saveMyDeclaration } from '@/modules/muster/tax/actions'
import { REGIME_LABEL, REGIMES, type Regime } from '@/modules/muster/tax/rules'
import type { DeclaredAmounts } from '@/modules/muster/tax/worksheet'
import { AmountFields } from './amount-fields'

/** The employee's own regime and declaration for a tax year. */
export function DeclarationForm({ fy, regime, values, disabled }: { fy: string; regime: Regime; values: DeclaredAmounts & { landlordName?: string }; disabled?: boolean }) {
  return (
    <ActionForm action={saveMyDeclaration} className="space-y-4">
      <input type="hidden" name="fy" value={fy} />
      <fieldset disabled={disabled} className="space-y-4">
        <FormField name="regime" label="Tax regime" help="The new regime has lower slabs but ignores most deductions; the old regime uses the amounts below.">
          <NativeSelect id="regime" name="regime" options={REGIMES.map((r) => ({ value: r, label: REGIME_LABEL[r] }))} defaultValue={regime} className="sm:w-72" />
        </FormField>
        <AmountFields prefix="declared" values={values} />
        <div className="flex justify-end"><SubmitButton>Save declaration</SubmitButton></div>
      </fieldset>
    </ActionForm>
  )
}
