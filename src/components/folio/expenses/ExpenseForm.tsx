'use client'

import { useState } from 'react'
import { Landmark, Paperclip, Receipt, Repeat, Wallet } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { saveExpense } from '@/modules/folio/expenses/actions'
import type { ExpenseFormOptions } from '@/modules/folio/expenses/queries'
import { EXPENSE_MODE_LABELS, EXPENSE_MODES, PAID_FROM, PAID_FROM_LABELS, type ExpenseMode, type PaidFrom } from '@/modules/folio/expenses/rules'
import type { ExpenseFormValues } from './expense-values'
import { INSET, LINK } from '../ui'
import { MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

/** Book or edit an expense: who was paid, from which firm and account, and the bill. */
export function ExpenseForm({ options, values, cancelHref }: { options: ExpenseFormOptions; values: ExpenseFormValues; cancelHref: string }) {
  const [entityId, setEntityId] = useState(values.entityId)
  const [paidFrom, setPaidFrom] = useState<PaidFrom>(values.paidFrom)
  const [mode, setMode] = useState<ExpenseMode>(values.mode)
  const entity = options.entities.find((e) => e.id === entityId)
  const isGst = entity?.kind === 'gst'
  const banks = entity?.banks ?? []
  const defaultBank = values.entityId === entityId && values.bankAccountId ? values.bankAccountId : ((banks.find((b) => b.isDefault) ?? banks[0])?.id ?? '')

  const pickMode = (next: string) => {
    const m = next as ExpenseMode
    setMode(m)
    if (m === 'cash') setPaidFrom('cash')
  }

  return (
    <ActionForm action={saveExpense} className="grid grid-cols-12 gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="col-span-12 space-y-4 lg:col-span-8">
        <Card variant="solid">
          <CardHeader label="What was paid" icon={<Wallet />} description="The total that left the account, GST included." />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="vendor" label="Paid to" required>
              <Input id="vendor" name="vendor" defaultValue={values.vendor} maxLength={120} placeholder="Malhotra Estates" />
            </FormField>
            <FormField name="categoryId" label="Category" required>
              <Select name="categoryId" defaultValue={values.categoryId || undefined} placeholder="Choose a category" options={options.categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (archived)` }))} />
            </FormField>
            <FormField name="amount" label="Amount paid (₹)" required help="GST included.">
              <Input id="amount" name="amount" inputMode="decimal" defaultValue={values.amount} placeholder="76,700" />
            </FormField>
            <FormField name="date" label="Paid on" required>
              <DateInput id="date" name="date" defaultValue={values.date} max={options.today} />
            </FormField>
            <FormField name="description" label="What for" className="sm:col-span-2">
              <Input id="description" name="description" defaultValue={values.description} maxLength={300} placeholder="Office rent for October" />
            </FormField>
          </div>
        </Card>

        <Card variant="solid">
          <CardHeader label="GST on the bill" icon={<Receipt />} description={isGst ? 'GST you can claim back as input tax is left out of the P&L cost.' : `${entity?.code ?? 'This firm'} is not GST-registered, so GST it pays is part of the cost.`} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="gst" label="GST in the amount (₹)" help="Leave blank if the bill has no GST.">
              <Input id="gst" name="gst" inputMode="decimal" defaultValue={values.gst} placeholder="11,700" />
            </FormField>
            <FormField name="vendorGstin" label="Vendor GSTIN">
              <Input id="vendorGstin" name="vendorGstin" defaultValue={values.vendorGstin} maxLength={15} className="uppercase" placeholder="23AABCM1234B1Z5" />
            </FormField>
            {isGst ? (
              <div className="sm:col-span-2">
                <Checkbox name="itcEligible" defaultChecked={values.itcEligible} label="Claim this GST as input tax" description="Tick when the bill is in this firm's name and GSTIN, and the expense qualifies for input tax credit." />
              </div>
            ) : null}
          </div>
        </Card>

        <Card variant="solid">
          <CardHeader label="Bill and notes" icon={<Paperclip />} />
          <div className="space-y-4">
            {values.receiptFileId ? (
              <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${INSET}`}>
                <a href={`/api/files/${values.receiptFileId}`} target="_blank" rel="noreferrer" className={LINK}>Open the attached bill</a>
                <Checkbox name="removeReceipt" label="Remove it" />
              </div>
            ) : null}
            <FormField name="receipt" label={values.receiptFileId ? 'Replace the bill' : 'Attach the bill'}>
              <FileUpload name="receipt" accept="image/png,image/jpeg,image/webp,application/pdf" hint={`PDF or photo, up to ${MAX_UPLOAD_LABEL}`} />
            </FormField>
            <FormField name="notes" label="Notes">
              <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes} maxLength={2000} />
            </FormField>
          </div>
        </Card>
      </div>

      <div className="col-span-12 space-y-4 lg:col-span-4">
        <Card variant="solid">
          <CardHeader label="Paid by" icon={<Landmark />} />
          <div className="space-y-4">
            <FormField name="entityId" label="Firm" required>
              <Select name="entityId" value={entityId || undefined} onValueChange={setEntityId} placeholder="Choose a firm" options={options.entities.map((e) => ({ value: e.id, label: `${e.code} · ${e.tradeName || e.legalName}` }))} />
            </FormField>
            <FormField name="mode" label="How it was paid">
              <Select name="mode" value={mode} onValueChange={pickMode} options={EXPENSE_MODES.map((m) => ({ value: m, label: EXPENSE_MODE_LABELS[m] }))} />
            </FormField>
            <FormField name="paidFrom" label="Paid from">
              <Select name="paidFrom" value={paidFrom} onValueChange={(v) => setPaidFrom(v as PaidFrom)} options={PAID_FROM.map((p) => ({ value: p, label: PAID_FROM_LABELS[p] }))} />
            </FormField>
            {paidFrom === 'bank' && banks.length ? (
              <FormField name="bankAccountId" label="Account">
                <NativeSelect key={entityId} id="bankAccountId" name="bankAccountId" defaultValue={defaultBank} placeholder="Not recorded" options={banks.map((b) => ({ value: b.id, label: `${b.label} · ${b.bankName} ${b.masked}` }))} />
              </FormField>
            ) : null}
            <FormField name="reference" label="Reference" help="UTR, cheque or card slip number.">
              <Input id="reference" name="reference" defaultValue={values.reference} maxLength={80} />
            </FormField>
          </div>
        </Card>
        <Card variant="solid">
          <CardHeader label="Repeats" icon={<Repeat />} />
          <Switch name="repeatMonthly" defaultChecked={values.repeatMonthly} label="Every month" description="Rent, subscriptions and retainers you pay. Copy it forward next month in one click." />
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" href={cancelHref}>Cancel</Button>
          <SubmitButton>{values.id ? 'Save expense' : 'Book expense'}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  )
}
