'use client'

import { useState, type ReactNode } from 'react'
import { FileSignature, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { removeSignatory, savePayslipSignature, saveSignatory, setDefaultSignatory } from '@/modules/settings/company-actions'
import { SignaturePicker } from './signature-picker'

export type SignatoryRow = { id: string; name: string; designation: string; hasSignature: boolean; hasSeal: boolean; isDefault: boolean }

function SignatoryDialog({ trigger, row, first }: { trigger: ReactNode; row?: SignatoryRow; first: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg" trigger={trigger} title={row ? `Edit ${row.name}` : 'Add an authorised signatory'} description="Their signature prints on HR letters, Form 130, receipts, statements and Folio documents. It is stored privately and only ever drawn into PDFs.">
      <ActionForm action={saveSignatory} onDone={() => setOpen(false)} className="space-y-4">
        {row ? <input type="hidden" name="id" value={row.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="name" label="Name" required>
            <Input id="name" name="name" defaultValue={row?.name ?? ''} maxLength={80} />
          </FormField>
          <FormField name="designation" label="Designation" required>
            <Input id="designation" name="designation" defaultValue={row?.designation ?? ''} maxLength={80} placeholder="Director" />
          </FormField>
        </div>
        <FormField name="signature" label="Signature" required={!row} help="PNG or JPEG. Sign on white paper and photograph it, or upload a scan.">
          <SignaturePicker name="signature" label="Signature" hasCurrent={Boolean(row?.hasSignature)} clearByDefault />
        </FormField>
        <FormField name="seal" label="Seal or stamp" help="Optional. Printed beside the signature.">
          <SignaturePicker name="seal" label="Seal" hasCurrent={Boolean(row?.hasSeal)} clearByDefault={false} />
        </FormField>
        {row?.hasSeal ? <Checkbox name="removeSeal" label="Remove the current seal" /> : null}
        {first || row?.isDefault ? <input type="hidden" name="isDefault" value="true" /> : <Checkbox name="isDefault" label="Make this the default signatory" />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>{row ? 'Save signatory' : 'Add signatory'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

function SignatoryItem({ row, canManage }: { row: SignatoryRow; canManage: boolean }) {
  const [makeDefault, pending] = useAction(setDefaultSignatory)
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
          {row.name}
          {row.isDefault ? <Badge tone="success">Default</Badge> : null}
        </p>
        <p className="text-[13px] text-fg-2">{row.designation} · {row.hasSignature ? 'Signature on file' : 'No signature'}{row.hasSeal ? ' · Seal on file' : ''}</p>
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {!row.isDefault ? <Button size="sm" variant="ghost" icon={<Star className="size-4" />} loading={pending} onClick={() => makeDefault({ id: row.id })}>Make default</Button> : null}
          <SignatoryDialog row={row} first={false} trigger={<Button size="sm" variant="secondary" icon={<Pencil className="size-4" />}>Edit</Button>} />
          <ConfirmDialog
            trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />}>Remove</Button>}
            title={`Remove ${row.name}?`}
            description="New documents stop using their signature. HR letters already issued keep it."
            confirmLabel="Remove"
            onConfirm={() => removeSignatory({ id: row.id })}
          />
        </div>
      ) : null}
    </li>
  )
}

/** Authorised signatories, the default one, and whether payslips carry a signature. */
export function SignatoriesCard({ rows, canManage, signPayslips }: { rows: SignatoryRow[]; canManage: boolean; signPayslips: boolean }) {
  return (
    <Card variant="solid">
      <CardHeader
        label="Authorised signatories"
        icon={<FileSignature />}
        description={canManage ? 'The default signs documents unless a letter type or Folio firm names someone else. Every change is in the audit log.' : 'Only owners and admins can add or change signatories.'}
        actions={canManage ? <SignatoryDialog first={rows.length === 0} trigger={<Button size="sm" variant="primary" icon={<Plus className="size-4" />}>Add signatory</Button>} /> : null}
      />
      {rows.length ? (
        <ul className="divide-y divide-white/[0.07]">
          {rows.map((row) => <SignatoryItem key={row.id} row={row} canManage={canManage} />)}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-2">No signatories yet. Documents print a blank “Authorised Signatory” line until you add one.</p>
      )}
      {canManage ? (
        <ActionForm action={savePayslipSignature} className="mt-4 flex flex-col gap-3 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Switch name="signPayslips" defaultChecked={signPayslips} label="Show signature on payslips" description="Off: payslips say they are computer-generated and need no signature." />
          <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
        </ActionForm>
      ) : null}
    </Card>
  )
}
