'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import { Select } from '@/components/ui/select'
import { convertLead } from '@/modules/orbit/lead-stage.actions'
import type { OrbitChoices, RecordHit } from '@/modules/orbit/record-types'
import { RecordPicker } from './record-picker'

export type ConvertLead = { id: string; companyName: string; contactName: string; email: string; valuePaise: number | null; ownerId: string }

/** Convert a lead at Meeting done into a client (new or existing) and a deal. */
export function ConvertDialog({ lead, choices, canAssign, today, open: openProp, onOpenChange, trigger }: { lead: ConvertLead; choices: Pick<OrbitChoices, 'dealStages' | 'owners'>; canAssign: boolean; today: string; open?: boolean; onOpenChange?: (v: boolean) => void; trigger?: ReactNode }) {
  const [inner, setInner] = useState(false)
  const open = openProp ?? inner
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInner(v)
    onOpenChange?.(v)
  }
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [client, setClient] = useState<RecordHit | null>(null)
  const firstStage = choices.dealStages[0]

  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title={`Convert ${lead.companyName}`} description="Creates the deal and links (or creates) the client. The lead closes as Converted." size="lg">
      <ActionForm action={convertLead} className="space-y-5" onDone={() => setOpen(false)}>
        <input type="hidden" name="id" value={lead.id} />
        <input type="hidden" name="clientMode" value={mode} />
        <section className="space-y-3">
          <p className="section-label">Client</p>
          <RadioCards
            value={mode}
            onValueChange={(v) => setMode(v as 'new' | 'existing')}
            columns={2}
            options={[
              { value: 'new', title: 'Create new client', description: `${lead.companyName}${lead.contactName ? ` · primary contact ${lead.contactName}` : ''}` },
              { value: 'existing', title: 'Link existing client', description: 'The lead’s contact is added to that client.' },
            ]}
          />
          {mode === 'existing' ? (
            <FormField name="clientId" label="Client" required>
              <RecordPicker kinds={['client']} value={client} onChange={setClient} placeholder={`Search clients, e.g. ${lead.companyName.split(' ')[0]}`} name="clientId" />
              {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
            </FormField>
          ) : null}
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <p className="section-label sm:col-span-2">Deal</p>
          <FormField name="title" label="Deal title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={lead.companyName} maxLength={140} /></FormField>
          <FormField name="valueRupees" label="Value (₹)" required><Input id="valueRupees" name="valueRupees" inputMode="decimal" defaultValue={lead.valuePaise ? String(lead.valuePaise / 100) : ''} placeholder="2,50,000" /></FormField>
          <FormField name="stage" label="Stage" required>
            <Select id="stage" name="stage" defaultValue={firstStage?.key} options={choices.dealStages.map((s) => ({ value: s.key, label: `${s.label} · ${s.probability}%` }))} />
          </FormField>
          <FormField name="expectedCloseDate" label="Expected close"><DateInput id="expectedCloseDate" name="expectedCloseDate" min={today} /></FormField>
          {canAssign ? (
            <FormField name="ownerId" label="Owner"><Select id="ownerId" name="ownerId" defaultValue={lead.ownerId} options={choices.owners} /></FormField>
          ) : null}
        </section>
        <div className="flex justify-end"><SubmitButton pendingLabel="Converting…">Convert</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
