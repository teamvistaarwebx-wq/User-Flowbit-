'use client'

import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ActionButton } from '@/components/muster/people/action-button'
import { removeDepartment, saveDepartment } from '@/modules/muster/settings/list-actions'
import { ListCard, ListRow, ListRows } from '../ui/list-card'

type Row = { id: string; name: string; code: string; people: number }

function DepartmentDialog({ row, trigger }: { row?: Row; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title={row ? `Edit ${row.name}` : 'Add a department'} size="sm">
      <ActionForm action={saveDepartment} onDone={() => setOpen(false)} resetOnSuccess={!row} className="space-y-4">
        {row ? <input type="hidden" name="id" value={row.id} /> : null}
        <FormField name="name" label="Name" required><Input id="name" name="name" defaultValue={row?.name} placeholder="Production" /></FormField>
        <FormField name="code" label="Code" required help="Short and unique, e.g. PROD"><Input id="code" name="code" defaultValue={row?.code} className="uppercase" /></FormField>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton>{row ? 'Save' : 'Add department'}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Departments: add, rename, remove (refused while anyone in the directory belongs to it). */
export function DepartmentsTab({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  return (
    <ListCard label="Departments" icon={<Building2 />} description="Teams people belong to. Used for filters, reports and the register." actions={canWrite ? <DepartmentDialog trigger={<Button variant="primary" size="sm" icon={<Plus className="size-4" />}>Add department</Button>} /> : null}>
      {rows.length ? (
        <ListRows>
          {rows.map((r) => (
            <ListRow key={r.id} className="flex-nowrap py-1.5">
              <span className="w-14 shrink-0 font-mono text-xs text-fg-2">{r.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-white">{r.name}</span>
              <span className="text-[13px] tabular-nums text-[#979797]">{r.people} {r.people === 1 ? 'person' : 'people'}</span>
              {canWrite ? (
                <>
                  <DepartmentDialog row={r} trigger={<IconButton label={`Edit ${r.name}`}><Pencil className="size-4" /></IconButton>} />
                  <ActionButton action={removeDepartment} input={{ id: r.id }} label={<Trash2 className="size-4" />} title={`Remove ${r.name}?`} description="People who already left keep it on their records." confirmLabel="Remove" />
                </>
              ) : null}
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <EmptyState compact icon={<Building2 />} title="No departments yet" description="Add the first one, like Design or Development." />
      )}
    </ListCard>
  )
}
