'use client'

import { useState, type ReactNode } from 'react'
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { deleteBankAccount, saveBankAccount } from '@/modules/folio/settings/entity-actions'
import { useRun } from '../use-run'
import { INSET } from '../ui'

export type BankValues = { id?: string; label: string; accountName: string; accountNumber: string; ifsc: string; bankName: string; branch: string; upiId: string; isDefault: boolean }

function BankDialog({ entityId, values, trigger }: { entityId: string; values: BankValues; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title={values.id ? `Edit ${values.label}` : 'Add a bank account'} description="Printed on invoices so clients know where to pay." trigger={trigger}>
      <ActionForm action={saveBankAccount} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="entityId" value={entityId} />
        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
        <FormField name="label" label="Label" required help="e.g. Current account"><Input name="label" defaultValue={values.label} /></FormField>
        <FormField name="bankName" label="Bank" required><Input name="bankName" defaultValue={values.bankName} placeholder="HDFC Bank" /></FormField>
        <FormField name="accountName" label="Account name" required className="sm:col-span-2"><Input name="accountName" defaultValue={values.accountName} /></FormField>
        <FormField name="accountNumber" label="Account number" required><Input name="accountNumber" defaultValue={values.accountNumber} inputMode="numeric" maxLength={18} /></FormField>
        <FormField name="ifsc" label="IFSC" required><Input name="ifsc" defaultValue={values.ifsc} maxLength={11} className="uppercase" /></FormField>
        <FormField name="branch" label="Branch"><Input name="branch" defaultValue={values.branch} /></FormField>
        <FormField name="upiId" label="UPI"><Input name="upiId" defaultValue={values.upiId} placeholder="name@bank" /></FormField>
        <Switch name="isDefault" defaultChecked={values.isDefault} label="Default account" description="Printed unless an invoice picks another" className="sm:col-span-2" />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>Save account</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

const BLANK: BankValues = { label: '', accountName: '', accountNumber: '', ifsc: '', bankName: '', branch: '', upiId: '', isDefault: false }

/** One entity's bank accounts. This is the only page that shows full account numbers. */
export function BankAccounts({ entityId, entityCode, accounts }: { entityId: string; entityCode: string; accounts: (BankValues & { id: string })[] }) {
  const run = useRun()
  return (
    <div className="space-y-2">
      {accounts.map((a) => (
        <div key={a.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${INSET}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Landmark className="size-4 shrink-0 text-icon-muted" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-white">{a.label}{a.isDefault ? <Badge tone="success">Default</Badge> : null}</p>
              <p className="text-xs tabular-nums text-fg-2">{a.bankName}{a.branch ? `, ${a.branch}` : ''} · A/c {a.accountNumber} · IFSC {a.ifsc}{a.upiId ? ` · UPI ${a.upiId}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <BankDialog entityId={entityId} values={a} trigger={<IconButton label={`Edit ${a.label}`} size="sm"><Pencil className="size-4" /></IconButton>} />
            <ConfirmDialog trigger={<IconButton label={`Remove ${a.label}`} size="sm"><Trash2 className="size-4" /></IconButton>} title={`Remove ${a.label} from ${entityCode}?`} description="Issued invoices keep the bank details they printed." confirmLabel="Remove account" onConfirm={() => run(deleteBankAccount({ entityId, id: a.id }))} />
          </div>
        </div>
      ))}
      <BankDialog entityId={entityId} values={{ ...BLANK, isDefault: accounts.length === 0 }} trigger={<Button size="sm" variant="secondary" icon={<Plus className="size-4" />}>Add account</Button>} />
    </div>
  )
}
