'use client'

import { Landmark } from 'lucide-react'
import { useState } from 'react'
import { formatINR } from '@/lib/money'
import { play } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, NativeSelect } from '@/components/ui/input'
import { FormField } from '@/components/ui/action-form'
import { BANK_LAYOUT_LABEL, BANK_LAYOUTS, DEBIT_ACCOUNT, PAYMENT_MODES } from '@/modules/muster/payroll/bank-file'
import type { BankFileSummary } from '@/modules/muster/payroll/bank-file-queries'
import { Note } from '../ui/note'

const OTHER = 'other'

/** Pick the bank layout, the account to pay from and the value date, then download the bulk-payment CSV. */
export function BankFileDialog({ cycleId, label, summary }: { cycleId: string; label: string; summary: BankFileSummary }) {
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState(summary.accounts[0]?.value ?? OTHER)
  const [typed, setTyped] = useState('')
  const debit = account === OTHER ? typed.trim() : account
  const valid = DEBIT_ACCOUNT.test(debit) && summary.payable > 0
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={<Button variant="secondary" size="sm" icon={<Landmark className="size-3.5" />}>Bank file</Button>}
      title={`Salary bank file · ${label}`}
      description={`${summary.payable} ${summary.payable === 1 ? 'payment' : 'payments'}, ${formatINR(summary.totalPaise)}. Check your bank's current template before the first upload.`}
    >
      <form action={`/api/muster/payroll/${cycleId}/bank-file`} method="get" className="space-y-4" onSubmit={() => {
        play('success')
        // Close after the browser has started the download; unmounting first cancels the submission.
        window.setTimeout(() => setOpen(false), 0)
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Layout" htmlFor="layout">
            <NativeSelect id="layout" name="layout" defaultValue="generic" options={BANK_LAYOUTS.map((l) => ({ value: l, label: BANK_LAYOUT_LABEL[l] }))} />
          </FormField>
          <FormField label="Mode" htmlFor="mode" help="IMPS above ₹5,00,000 goes by NEFT.">
            <NativeSelect id="mode" name="mode" defaultValue="NEFT" options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))} />
          </FormField>
          <FormField label="Pay from" htmlFor="account" className={account === OTHER ? undefined : 'sm:col-span-2'}>
            <NativeSelect id="account" value={account} onChange={(e) => setAccount(e.target.value)} options={[...summary.accounts, { value: OTHER, label: 'Another account (type it)' }]} />
          </FormField>
          {account === OTHER ? (
            <FormField label="Debit account number" htmlFor="debit-typed" help="9 to 18 digits">
              <Input id="debit-typed" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D+/g, ''))} placeholder="00112233445566" />
            </FormField>
          ) : null}
          <input type="hidden" name="debit" value={debit} />
          <FormField label="Value date" htmlFor="date">
            <DateInput id="date" name="date" defaultValue={summary.valueDate} required />
          </FormField>
          <FormField label="Narration" htmlFor="narration" help="Up to 30 letters and digits">
            <Input id="narration" name="narration" defaultValue={summary.narration} maxLength={30} required />
          </FormField>
        </div>
        {summary.skipped.length ? (
          <Note tone="warning" title={`Left out of the file (${summary.skipped.length})`}>
            <ul className="mt-1 space-y-0.5 text-xs">{summary.skipped.slice(0, 8).map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul>
            <p className="mt-1 text-xs">Pay them separately, or add their bank details and download again.</p>
          </Note>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid} sound={false}>Download CSV</Button>
        </div>
      </form>
    </Dialog>
  )
}
