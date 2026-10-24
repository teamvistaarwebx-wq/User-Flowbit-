'use client'

import { useMemo, useState } from 'react'
import { Banknote, ListChecks } from 'lucide-react'
import { paiseToRupees } from '@/lib/money'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AllocationSummary, AllocationTable, appliedOf, valuePaise, type AllocationValues } from '@/components/folio/AllocationTable'
import { INSET } from '@/components/folio/ui'
import { recordReceiptAction } from '@/modules/folio/receipts/actions'
import type { ReceiptFormOptions } from '@/modules/folio/receipts/queries'
import { RECEIPT_MODE_LABELS, RECEIPT_MODES, type ReceiptMode } from '@/modules/folio/receipts/rules'

type ReceiptFormProps = { options: ReceiptFormOptions; initialClientId?: string; initialInvoiceId?: string }

const defaultEntityFor = (options: ReceiptFormOptions, clientId: string): string => {
  const preferred = options.clients.find((c) => c.id === clientId)?.defaultEntityId
  if (preferred && options.entities.some((e) => e.id === preferred)) return preferred
  return (options.entities.find((e) => e.isDefault) ?? options.entities[0])?.id ?? ''
}

function initialState(options: ReceiptFormOptions, clientId?: string, invoiceId?: string) {
  const invoice = invoiceId ? options.invoices.find((i) => i.invoiceId === invoiceId) : undefined
  const client = invoice?.clientId ?? (clientId && options.clients.some((c) => c.id === clientId) ? clientId : '')
  const entity = invoice?.entityId ?? (client ? defaultEntityFor(options, client) : '')
  const amount = invoice ? String(paiseToRupees(invoice.owedPaise)) : ''
  const values: AllocationValues = invoice ? { [invoice.invoiceId]: { amount, tds: '' } } : {}
  return { client, entity, amount, values }
}

/** Record payment: who paid, into which entity and account, then what it settles. */
export function ReceiptForm({ options, initialClientId, initialInvoiceId }: ReceiptFormProps) {
  const start = useMemo(() => initialState(options, initialClientId, initialInvoiceId), [options, initialClientId, initialInvoiceId])
  const [clientId, setClientId] = useState(start.client)
  const [entityId, setEntityId] = useState(start.entity)
  const [amount, setAmount] = useState(start.amount)
  const [mode, setMode] = useState<ReceiptMode>('bank_transfer')
  const [values, setValues] = useState<AllocationValues>(start.values)

  const client = options.clients.find((c) => c.id === clientId)
  const entity = options.entities.find((e) => e.id === entityId)
  const rows = useMemo(
    () => options.invoices.filter((i) => i.clientId === clientId && i.entityId === entityId).map((i) => ({ invoiceId: i.invoiceId, number: i.number, dueDate: i.dueDate, owedPaise: i.owedPaise, tdsLeftPaise: i.tdsLeftPaise })),
    [options.invoices, clientId, entityId],
  )
  const receivedPaise = valuePaise(amount)
  const appliedPaise = appliedOf(Object.fromEntries(Object.entries(values).filter(([id]) => rows.some((r) => r.invoiceId === id))))
  const overApplied = appliedPaise > receivedPaise
  const defaultBank = entity?.banks.find((b) => b.isDefault) ?? entity?.banks[0]

  const pickClient = (id: string) => {
    setClientId(id)
    setEntityId(defaultEntityFor(options, id))
    setValues({})
  }
  const pickEntity = (id: string) => {
    setEntityId(id)
    setValues({})
  }

  return (
    <ActionForm action={recordReceiptAction} className="grid grid-cols-12 gap-4">
      <div className="col-span-12 space-y-4 lg:col-span-8">
        <Card variant="solid">
          <CardHeader label="Payment" icon={<Banknote />} description="Money arrives against a client. Applying it to invoices comes next." />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="clientId" label="Client" required className="sm:col-span-2">
              <Select name="clientId" value={clientId || undefined} onValueChange={pickClient} placeholder="Choose a client" options={options.clients.map((c) => ({ value: c.id, label: c.name }))} />
            </FormField>
            <FormField name="entityId" label="Received into" required help={options.entities.length > 1 ? 'Changing it shows that entity’s open invoices.' : undefined}>
              <Select name="entityId" value={entityId || undefined} onValueChange={pickEntity} placeholder="Choose a firm" options={options.entities.map((e) => ({ value: e.id, label: `${e.code} · ${e.tradeName || e.legalName}` }))} />
            </FormField>
            <FormField name="amount" label="Amount received (₹)" required>
              <Input id="amount" name="amount" inputMode="decimal" placeholder="50,000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField name="receivedOn" label="Received on" required>
              <DateInput id="receivedOn" name="receivedOn" defaultValue={options.today} max={options.today} />
            </FormField>
            <FormField name="mode" label="How it arrived">
              <Select name="mode" value={mode} onValueChange={(v) => setMode(v as ReceiptMode)} options={RECEIPT_MODES.map((m) => ({ value: m, label: RECEIPT_MODE_LABELS[m] }))} />
            </FormField>
            <FormField name="reference" label="Reference" help="UTR, cheque number or gateway id — whatever the bank statement shows.">
              <Input id="reference" name="reference" placeholder="HDFCR52026100112345" />
            </FormField>
            {entity?.banks.length ? (
              <FormField name="bankAccountId" label="Into which account">
                <Select key={entityId} name="bankAccountId" defaultValue={defaultBank?.id} options={entity.banks.map((b) => ({ value: b.id, label: `${b.label} · ${b.masked}`, hint: b.bankName }))} />
              </FormField>
            ) : null}
            {mode === 'cheque' ? (
              <FormField name="instrumentDate" label="Cheque date">
                <DateInput id="instrumentDate" name="instrumentDate" />
              </FormField>
            ) : null}
            <FormField name="notes" label="Notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={2} placeholder="Advance against next quarter, to be applied when invoiced" />
            </FormField>
          </div>
        </Card>
        <Card variant="solid">
          <CardHeader label="What it settles" icon={<ListChecks />} description={client ? `${client.name}’s open invoices${entity ? ` billed by ${entity.code}` : ''}, oldest due first.` : undefined} />
          {client ? (
            <AllocationTable rows={rows} values={values} onChange={setValues} receivedPaise={receivedPaise} showTds={client.tdsOn} today={options.today} emptyText="Nothing outstanding. This will be recorded as advance credit." />
          ) : (
            <p className={`px-4 py-8 text-center text-[13px] text-fg-2 ${INSET}`}>Choose a client to see their open invoices.</p>
          )}
        </Card>
      </div>
      <aside className="col-span-12 lg:col-span-4">
        <Card variant="solid" className="space-y-5 lg:sticky lg:top-4">
          <AllocationSummary receivedPaise={receivedPaise} appliedPaise={appliedPaise} />
          <SubmitButton className="w-full" disabled={!clientId || !entityId || overApplied || receivedPaise <= 0} pendingLabel="Recording…">
            Record payment
          </SubmitButton>
        </Card>
      </aside>
    </ActionForm>
  )
}
