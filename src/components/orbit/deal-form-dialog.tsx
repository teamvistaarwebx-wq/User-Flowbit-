'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { toast } from '@/lib/toast'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { quickCreateClient } from '@/modules/clients/actions'
import { createDeal } from '@/modules/orbit/deals.actions'
import type { OrbitChoices, RecordHit } from '@/modules/orbit/record-types'
import { clientContacts } from '@/modules/orbit/search.actions'
import { RecordPicker } from './record-picker'

type ContactOption = { id: string; name: string; role: string; primary: boolean }

/** Contacts of the picked client, loaded on demand. */
export function useClientContacts(clientId: string | undefined) {
  const [contacts, setContacts] = useState<ContactOption[]>([])
  useEffect(() => {
    if (!clientId) return
    let live = true
    clientContacts({ clientId }).then((res) => {
      if (!live) return
      if (res.ok) setContacts(res.data ?? [])
      else toast.error(res.error)
    })
    return () => {
      live = false
    }
  }, [clientId])
  return clientId ? contacts : []
}

function NewClientInline({ onCreated }: { onCreated: (hit: RecordHit) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    const res = await quickCreateClient({ name })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(res.message ?? 'Client added')
    if (res.data) onCreated({ kind: 'client', id: res.data.id, label: res.data.name, sub: 'Client (lead)' })
  }
  return (
    <div className="flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} placeholder="New client name" aria-label="New client name" inputSize="sm" />
      <Button size="sm" variant="secondary" loading={busy} disabled={name.trim().length < 2} onClick={create} icon={<Plus className="size-4" />}>Add</Button>
    </div>
  )
}

export type DealFormDialogProps = {
  trigger: ReactNode
  choices: Pick<OrbitChoices, 'dealStages' | 'owners' | 'sources' | 'sectors'>
  canAssign: boolean
  canCreateClient: boolean
  today: string
  fixedClient?: { id: string; name: string }
}

/** New deal for an existing (or just-created) client. */
export function DealFormDialog({ trigger, choices, canAssign, canCreateClient, today, fixedClient }: DealFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [client, setClient] = useState<RecordHit | null>(fixedClient ? { kind: 'client', id: fixedClient.id, label: fixedClient.name, sub: 'Client' } : null)
  const [stage, setStage] = useState(choices.dealStages[0]?.key ?? '')
  const [probability, setProbability] = useState(String(choices.dealStages[0]?.probability ?? 0))
  const contacts = useClientContacts(client?.id)

  const pickStage = (key: string) => {
    setStage(key)
    const s = choices.dealStages.find((x) => x.key === key)
    if (s) setProbability(String(s.probability))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="New deal" description="Money you expect to close, with its stage and probability." size="lg">
      <ActionForm action={createDeal} className="grid gap-4 sm:grid-cols-2" onDone={() => setOpen(false)}>
        <FormField name="title" label="Deal title" required className="sm:col-span-2"><Input id="deal-title" name="title" placeholder="Website revamp + 6-month retainer" maxLength={140} /></FormField>
        <FormField name="clientId" label="Client" required className="sm:col-span-2">
          {fixedClient ? <Input value={fixedClient.name} readOnly aria-label="Client" /> : <RecordPicker kinds={['client']} value={client} onChange={setClient} placeholder="Search clients" name="clientId" />}
          {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
          {!client && !fixedClient && canCreateClient ? <NewClientInline onCreated={setClient} /> : null}
        </FormField>
        <FormField name="contactId" label="Contact">
          <Select id="deal-contact" name="contactId" options={contacts.map((c) => ({ value: c.id, label: c.name, hint: c.primary ? 'primary' : c.role }))} placeholder={client ? (contacts.length ? 'Pick a contact' : 'No contacts yet') : 'Pick a client first'} disabled={!contacts.length} />
        </FormField>
        <FormField name="valueRupees" label="Value (₹)" required><Input id="deal-value" name="valueRupees" inputMode="decimal" placeholder="2,50,000" /></FormField>
        <FormField name="stage" label="Stage" required>
          <Select id="deal-stage" name="stage" value={stage} onValueChange={pickStage} options={choices.dealStages.map((s) => ({ value: s.key, label: s.label }))} />
        </FormField>
        <FormField name="probability" label="Probability (%)"><Input id="deal-prob" name="probability" inputMode="numeric" value={probability} onChange={(e) => setProbability(e.target.value)} /></FormField>
        <FormField name="expectedCloseDate" label="Expected close"><DateInput id="deal-close" name="expectedCloseDate" min={today} /></FormField>
        {canAssign ? <FormField name="ownerId" label="Owner"><Select id="deal-owner" name="ownerId" options={choices.owners} placeholder="Me" /></FormField> : null}
        <FormField name="source" label="Source"><Select id="deal-source" name="source" options={choices.sources.map((s) => ({ value: s.key, label: s.label }))} placeholder="Optional" /></FormField>
        <FormField name="sector" label="Sector"><Select id="deal-sector" name="sector" options={choices.sectors.map((s) => ({ value: s.key, label: s.label }))} placeholder="Optional" /></FormField>
        <FormField name="notes" label="Notes" className="sm:col-span-2"><Textarea id="deal-notes" name="notes" rows={2} maxLength={2000} /></FormField>
        <div className="flex justify-end sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create deal</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
