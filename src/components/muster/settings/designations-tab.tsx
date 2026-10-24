'use client'

import { BadgeCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ActionButton } from '@/components/muster/people/action-button'
import { removeDesignation, saveDesignation } from '@/modules/muster/settings/list-actions'
import { ListCard, ListRow, ListRows } from '../ui/list-card'

type Row = { id: string; title: string; people: number }

function DesignationDialog({ row, trigger }: { row?: Row; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title={row ? `Rename ${row.title}` : 'Add a designation'} description={row ? 'Everyone with this designation shows the new title.' : undefined} size="sm">
      <ActionForm action={saveDesignation} onDone={() => setOpen(false)} resetOnSuccess={!row} className="space-y-4">
        {row ? <input type="hidden" name="id" value={row.id} /> : null}
        <FormField name="title" label="Title" required><Input id="title" name="title" defaultValue={row?.title} placeholder="Senior Designer" /></FormField>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton>{row ? 'Save' : 'Add designation'}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Designations: add, rename (updates everyone holding it), remove when nobody current holds it. */
export function DesignationsTab({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  return (
    <ListCard label="Designations" icon={<BadgeCheck />} description="Job titles for the people directory and letters." actions={canWrite ? <DesignationDialog trigger={<Button variant="primary" size="sm" icon={<Plus className="size-4" />}>Add designation</Button>} /> : null}>
      {rows.length ? (
        <ListRows>
          {rows.map((r) => (
            <ListRow key={r.id} className="flex-nowrap py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-white">{r.title}</span>
              <span className="text-[13px] tabular-nums text-[#979797]">{r.people} {r.people === 1 ? 'person' : 'people'}</span>
              {canWrite ? (
                <>
                  <DesignationDialog row={r} trigger={<IconButton label={`Rename ${r.title}`}><Pencil className="size-4" /></IconButton>} />
                  <ActionButton action={removeDesignation} input={{ id: r.id }} label={<Trash2 className="size-4" />} title={`Remove ${r.title}?`} confirmLabel="Remove" />
                </>
              ) : null}
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <EmptyState compact icon={<BadgeCheck />} title="No designations yet" description="Add the first one, like Designer or Full Stack Developer." />
      )}
    </ListCard>
  )
}
