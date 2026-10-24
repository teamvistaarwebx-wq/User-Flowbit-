'use client'

import { Archive, Layers, Pencil, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { loadStandardCategories, saveClaimCategory, setClaimCategoryActive, setClaimFormStatus } from '@/modules/muster/claims/form-actions'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export type CategoryValue = { id: string; code: string; name: string; maxRupees: string; displayOrder: number }

/** Add or edit a claim category (code is fixed once created). */
export function CategoryDialog({ category }: { category?: CategoryValue }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        category ? (
          <IconButton label={`Edit ${category.name}`} size="sm">
            <Pencil className="size-3.5" />
          </IconButton>
        ) : (
          <Button variant="primary" icon={<Plus className="size-4" />}>
            Add category
          </Button>
        )
      }
      title={category ? `Edit ${category.name}` : 'Add a claim category'}
      description="A ceiling caps each claim in this category; leave it blank for none."
    >
      <ActionForm action={saveClaimCategory} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <FormField name="code" label="Code" required help="Like TRAVEL or CLIENT">
          <Input id="code" name="code" defaultValue={category?.code} readOnly={Boolean(category)} placeholder="TRAVEL" />
        </FormField>
        <FormField name="name" label="Name" required>
          <Input id="name" name="name" defaultValue={category?.name} placeholder="Travel" />
        </FormField>
        <FormField name="maxAmount" label="Ceiling per claim (₹)">
          <Input id="maxAmount" name="maxAmount" inputMode="decimal" defaultValue={category?.maxRupees} placeholder="No ceiling" />
        </FormField>
        <FormField name="displayOrder" label="Order">
          <Input id="displayOrder" name="displayOrder" inputMode="numeric" defaultValue={category?.displayOrder ?? 0} />
        </FormField>
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>{category ? 'Save category' : 'Add category'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

export function CategoryActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [run, pending] = useAction(setClaimCategoryActive)
  if (active) {
    return (
      <ConfirmDialog
        trigger={
          <IconButton label={`Retire ${name}`} size="sm">
            <Archive className="size-3.5" />
          </IconButton>
        }
        title={`Retire ${name}?`}
        description="Existing claims keep this category; new forms cannot offer it. You can restore it later."
        confirmLabel="Retire"
        onConfirm={() => setClaimCategoryActive({ id, active: false })}
      />
    )
  }
  return (
    <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={pending} onClick={() => run({ id, active: true })}>
      Restore
    </Button>
  )
}

export function LoadStandardCategories() {
  const [run, pending] = useAction(loadStandardCategories)
  return (
    <Button variant="secondary" icon={<Layers className="size-4" />} loading={pending} onClick={() => run({})}>
      Load the standard set
    </Button>
  )
}

/** Close a form's submissions, or reopen them (confirmed). */
export function FormStatusButton({ id, name, open, size = 'sm' }: { id: string; name: string; open: boolean; size?: 'sm' | 'md' }) {
  return open ? (
    <ConfirmDialog
      trigger={<Button size={size} variant="secondary">Close</Button>}
      title={`Close "${name}"?`}
      description="Its link stops taking claims. Claims already filed stay in the queue."
      confirmLabel="Close submissions"
      onConfirm={() => setClaimFormStatus({ id, status: 'closed' })}
    />
  ) : (
    <ConfirmDialog
      trigger={<Button size={size} variant="secondary">Reopen</Button>}
      title={`Reopen "${name}"?`}
      description="Its link takes claims again until the deadline."
      confirmLabel="Reopen"
      tone="primary"
      onConfirm={() => setClaimFormStatus({ id, status: 'open' })}
    />
  )
}
