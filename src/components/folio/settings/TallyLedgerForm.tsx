'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { saveTallySettings } from '@/modules/folio/settings/actions'
import { DEFAULT_TALLY_LEDGERS, TALLY_LEDGER_KEYS, TALLY_LEDGER_LABELS, type TallyLedgers } from '@/modules/folio/tally/ledgers'

/** Flowbit accounts → Tally ledger names. A blank field keeps following the default shown as its placeholder. */
export function TallyLedgerForm({ company, stored }: { company: string; stored: Partial<TallyLedgers> }) {
  return (
    <ActionForm action={saveTallySettings} className="space-y-5">
      <FormField name="company" label="Tally company name" help="Optional. Tally imports into this company when the name matches exactly.">
        <Input name="company" defaultValue={company} maxLength={120} placeholder="As named in Tally" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {TALLY_LEDGER_KEYS.map((k) => (
          <FormField key={k} name={k} label={TALLY_LEDGER_LABELS[k].label} help={TALLY_LEDGER_LABELS[k].help}>
            <Input name={k} defaultValue={stored[k] ?? ''} placeholder={DEFAULT_TALLY_LEDGERS[k]} maxLength={100} />
          </FormField>
        ))}
      </div>
      <div className="flex justify-end"><SubmitButton>Save ledger names</SubmitButton></div>
    </ActionForm>
  )
}
