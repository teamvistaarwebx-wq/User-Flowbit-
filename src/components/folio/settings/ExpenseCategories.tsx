'use client'

import { useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { saveExpenseCategory, setExpenseCategoryActive } from '@/modules/folio/expenses/actions'
import { FolioStatus } from '../StatusBadge'
import { Td, Th, TBODY_ROW } from '../ui'

type Category = { id: string; name: string; isActive: boolean; count: number }

function CategoryDialog({ category, trigger }: { category?: Category; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} size="sm" title={category ? `Rename ${category.name}` : 'Add a category'} description={category ? 'Past expenses show the new name.' : 'It appears in the category picker straight away.'} trigger={trigger}>
      <ActionForm action={saveExpenseCategory} onDone={() => setOpen(false)} className="space-y-4">
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <FormField name="name" label="Name" required><Input name="name" defaultValue={category?.name ?? ''} maxLength={60} placeholder="Equipment" /></FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton>{category ? 'Rename' : 'Add category'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

/** Expense categories: renamed or archived, never deleted, so booked expenses keep theirs. */
export function ExpenseCategories({ categories }: { categories: Category[] }) {
  const [toggle, toggling] = useAction(setExpenseCategoryActive)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-2">Archived categories leave the picker; expenses already booked keep them.</p>
        <CategoryDialog trigger={<Button size="sm" variant="primary" icon={<Plus className="size-4" />}>Add category</Button>} />
      </div>
      <div className="card-table overflow-x-auto pb-1.5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              {['Category', 'Expenses', 'Status', ''].map((h) => <Th key={h}>{h}</Th>)}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className={TBODY_ROW}>
                <Td className="font-medium">{c.name}</Td>
                <Td className="tabular-nums text-white/75">{c.count}</Td>
                <Td><FolioStatus status={c.isActive ? 'active' : 'ended'} label={c.isActive ? 'Active' : 'Archived'} /></Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <CategoryDialog category={c} trigger={<IconButton label={`Rename ${c.name}`} size="sm"><Pencil className="size-4" /></IconButton>} />
                    <IconButton label={c.isActive ? `Archive ${c.name}` : `Restore ${c.name}`} size="sm" disabled={toggling} onClick={() => toggle({ id: c.id, active: !c.isActive })}>{c.isActive ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}</IconButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
