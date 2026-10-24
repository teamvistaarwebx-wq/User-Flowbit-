'use client'

import { Archive, Layers, Pencil, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { CALCULATION_LABELS, CALCULATION_TYPES, COMPONENT_TYPES, COMPONENT_TYPE_LABELS, type CalculationType, type ComponentType } from '@/modules/muster/payroll/components'
import { loadStandardComponents, saveSalaryComponent, setComponentActive } from '@/modules/muster/payroll/settings-actions'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export type ComponentValue = {
  id: string
  code: string
  name: string
  componentType: ComponentType
  calculationType: CalculationType
  /** Rupees for fixed, % otherwise (as typed). */
  defaultValue: string
  countsForPf: boolean
  countsForEsi: boolean
  countsForWages: boolean
  prorateOnLop: boolean
  isTaxable: boolean
  isRecurring: boolean
  displayOrder: number
  locked: boolean
}

/** Add or edit a salary component. Protected components keep their code and type (only the name and order change). */
export function ComponentDialog({ component }: { component?: ComponentValue }) {
  const [open, setOpen] = useState(false)
  const [basis, setBasis] = useState<CalculationType>(component?.calculationType ?? 'fixed')
  const locked = Boolean(component?.locked)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={component ? <IconButton label={`Edit ${component.code}`} size="sm"><Pencil className="size-3.5" /></IconButton> : <Button variant="primary" icon={<Plus className="size-4" />}>Add component</Button>}
      title={component ? `Edit ${component.name}` : 'Add a salary component'}
      description={locked ? 'Payroll computes this component itself, so only its name and order can change.' : 'Earnings make up gross pay; deductions recover from it; employer contributions are the company’s own cost.'}
    >
      <ActionForm action={saveSalaryComponent} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        {component ? <input type="hidden" name="id" value={component.id} /> : null}
        <FormField name="code" label="Code" required help="Like CONVEYANCE">
          <Input id="code" name="code" defaultValue={component?.code} readOnly={Boolean(component)} />
        </FormField>
        <FormField name="name" label="Name" required>
          <Input id="name" name="name" defaultValue={component?.name} placeholder="Conveyance Allowance" />
        </FormField>
        <FormField name="componentType" label="Type" required>
          <NativeSelect id="componentType" name="componentType" options={COMPONENT_TYPES.map((t) => ({ value: t, label: COMPONENT_TYPE_LABELS[t] }))} defaultValue={component?.componentType ?? 'earning'} disabled={locked} />
        </FormField>
        <FormField name="calculationType" label="Basis" required>
          <NativeSelect id="calculationType" name="calculationType" options={CALCULATION_TYPES.map((t) => ({ value: t, label: CALCULATION_LABELS[t] }))} value={basis} onChange={(e) => setBasis(e.target.value as CalculationType)} disabled={locked} />
        </FormField>
        <FormField name="defaultValue" label={basis === 'fixed' ? 'Default amount (₹)' : basis === 'computed' ? 'Default value' : 'Default %'}>
          <Input id="defaultValue" name="defaultValue" inputMode="decimal" defaultValue={component?.defaultValue ?? '0'} disabled={locked} />
        </FormField>
        <FormField name="displayOrder" label="Order on payslip">
          <Input id="displayOrder" name="displayOrder" inputMode="numeric" defaultValue={component?.displayOrder ?? 100} />
        </FormField>
        {locked ? (
          <>
            <input type="hidden" name="componentType" value={component?.componentType} />
            <input type="hidden" name="calculationType" value={component?.calculationType} />
            <input type="hidden" name="defaultValue" value={component?.defaultValue} />
          </>
        ) : (
          <div className="grid gap-3 lit-edge rounded-[10px] bg-white/[0.035] p-3 sm:col-span-2 sm:grid-cols-2">
            <Switch name="countsForPf" defaultChecked={component?.countsForPf} label="Counts for PF wage" />
            <Switch name="countsForEsi" defaultChecked={component?.countsForEsi} label="Counts for ESI wage" />
            <Switch name="countsForWages" defaultChecked={component?.countsForWages} label="Counts as wages (gratuity)" />
            <Switch name="prorateOnLop" defaultChecked={component?.prorateOnLop ?? true} label="Reduced for loss of pay" />
            <Switch name="isTaxable" defaultChecked={component?.isTaxable ?? true} label="Taxable" />
            <Switch name="isRecurring" defaultChecked={component?.isRecurring ?? true} label="Paid every month" />
          </div>
        )}
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>{component ? 'Save component' : 'Add component'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

export function ComponentActiveToggle({ id, name, active, locked }: { id: string; name: string; active: boolean; locked: boolean }) {
  const [run, pending] = useAction(setComponentActive)
  if (locked) return null
  if (!active) {
    return (
      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={pending} onClick={() => run({ id, active: true })}>
        Restore
      </Button>
    )
  }
  return (
    <ConfirmDialog
      trigger={<IconButton label={`Retire ${name}`} size="sm"><Archive className="size-3.5" /></IconButton>}
      title={`Retire ${name}?`}
      description="Structures that use it keep it; new structures cannot add it. You can restore it later."
      confirmLabel="Retire"
      onConfirm={() => setComponentActive({ id, active: false })}
    />
  )
}

export function LoadStandardComponents() {
  const [run, pending] = useAction(loadStandardComponents)
  return (
    <Button variant="secondary" icon={<Layers className="size-4" />} loading={pending} onClick={() => run({})}>
      Load the standard set
    </Button>
  )
}
