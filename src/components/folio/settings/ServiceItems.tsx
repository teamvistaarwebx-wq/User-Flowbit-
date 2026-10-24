'use client'

import { useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { formatINR } from '@/lib/money'
import { saveServiceItem, setServiceItemActive } from '@/modules/folio/settings/actions'
import { FolioStatus } from '../StatusBadge'
import { Td, Th, TBODY_ROW } from '../ui'

export type ServiceValues = { id?: string; code: string; name: string; description: string; hsnSac: string; unit: string; ratePaise: number; gstRatePercent: number; isActive: boolean }

function ServiceDialog({ values, taxRates, trigger }: { values: ServiceValues; taxRates: number[]; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title={values.id ? `Edit ${values.name}` : 'Add a service'} description="Picking it on a line fills the description, SAC, unit, rate and GST rate." trigger={trigger}>
      <ActionForm action={saveServiceItem} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
        <FormField name="code" label="Code" required><Input name="code" defaultValue={values.code} className="uppercase" maxLength={20} placeholder="SVC-SEO" /></FormField>
        <FormField name="name" label="Name" required><Input name="name" defaultValue={values.name} maxLength={120} /></FormField>
        <FormField name="description" label="Line description" className="sm:col-span-2"><Textarea name="description" rows={2} defaultValue={values.description} maxLength={500} /></FormField>
        <FormField name="hsnSac" label="SAC"><Input name="hsnSac" defaultValue={values.hsnSac} inputMode="numeric" maxLength={8} /></FormField>
        <FormField name="unit" label="Unit"><Input name="unit" defaultValue={values.unit} maxLength={20} /></FormField>
        <FormField name="rate" label="Rate (₹)"><Input name="rate" inputMode="decimal" defaultValue={values.ratePaise ? (values.ratePaise / 100).toFixed(2) : ''} /></FormField>
        <FormField name="gstRatePercent" label="GST %"><NativeSelect name="gstRatePercent" defaultValue={String(values.gstRatePercent)} options={taxRates.map((r) => ({ value: String(r), label: `${r}%` }))} /></FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>Save service</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

/** The service catalogue: archived, never deleted. */
export function ServiceItems({ items, taxRates }: { items: (ServiceValues & { id: string })[]; taxRates: number[] }) {
  const [toggle, toggling] = useAction(setServiceItemActive)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-2">Archived services stop appearing in the picker; past invoice lines keep them.</p>
        <ServiceDialog values={{ code: '', name: '', description: '', hsnSac: '', unit: 'nos', ratePaise: 0, gstRatePercent: 18, isActive: true }} taxRates={taxRates} trigger={<Button size="sm" variant="primary" icon={<Plus className="size-4" />}>Add service</Button>} />
      </div>
      <div className="card-table overflow-x-auto pb-1.5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              {['Code', 'Name', 'SAC', 'Unit', 'Rate', 'GST', 'Status', ''].map((h) => <Th key={h}>{h}</Th>)}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-fg-2">No services yet. Add the things you bill often.</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className={TBODY_ROW}>
                  <Td className="font-medium">{s.code}</Td>
                  <Td className="text-white/80">{s.name}</Td>
                  <Td className="tabular-nums text-white/75">{s.hsnSac || '—'}</Td>
                  <Td className="text-white/75">{s.unit}</Td>
                  <Td className="tabular-nums text-white/75">{formatINR(s.ratePaise)}</Td>
                  <Td className="text-white/75">{s.gstRatePercent}%</Td>
                  <Td><FolioStatus status={s.isActive ? 'active' : 'ended'} label={s.isActive ? 'Active' : 'Archived'} /></Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <ServiceDialog values={s} taxRates={taxRates} trigger={<IconButton label={`Edit ${s.name}`} size="sm"><Pencil className="size-4" /></IconButton>} />
                      <IconButton label={s.isActive ? 'Archive' : 'Restore'} size="sm" disabled={toggling} onClick={() => toggle({ id: s.id, active: !s.isActive })}>{s.isActive ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}</IconButton>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
