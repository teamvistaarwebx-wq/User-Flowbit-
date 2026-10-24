'use client'

import { useState } from 'react'
import { ListChecks, Pencil, Timer, Trash2, PenLine } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { ChipGroup } from '@/components/ui/chip-group'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate, formatDuration } from '@/lib/dates'
import { deleteEntry, setBillable, updateEntry } from '@/modules/work/time/actions'
import { formatHM } from '@/modules/work/time/format'
import { PanelHeader } from '../shared/table'

export type EntryRow = { id: string; key: string; label: string; date: string; minutes: number; note: string; billable: boolean; source: string; isRunning: boolean }

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'billable', label: 'Billable' },
  { value: 'non', label: 'Non-billable' },
]

function EditEntry({ entry }: { entry: EntryRow }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Edit time entry" description={`${entry.label} · ${formatDate(entry.date)}`} trigger={<IconButton label="Edit entry" size="sm"><Pencil className="size-4" /></IconButton>}>
      <ActionForm action={updateEntry} onDone={() => setOpen(false)} className="grid gap-4">
        <input type="hidden" name="id" value={entry.id} />
        <FormField name="duration" label="Time" required help="1:30, 1h 30m or 90m">
          <Input id="duration" name="duration" defaultValue={formatHM(entry.minutes)} />
        </FormField>
        <FormField name="note" label="Note">
          <Textarea id="note" name="note" rows={2} maxLength={500} defaultValue={entry.note} />
        </FormField>
        <Checkbox name="billable" label="Billable" defaultChecked={entry.billable} />
        <div className="flex justify-end">
          <SubmitButton>Save</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

function BillableToggle({ entry, editable }: { entry: EntryRow; editable: boolean }) {
  const [run, pending] = useAction(setBillable)
  return <Switch checked={entry.billable} disabled={!editable || pending} onCheckedChange={(billable) => run({ id: entry.id, billable })} aria-label="Billable" />
}

/** Entries of the week with billable toggles, edit and delete while the week is open. */
export function EntryList({ entries, editable }: { entries: EntryRow[]; editable: boolean }) {
  const [filter, setFilter] = useState('all')
  const shown = entries.filter((e) => filter === 'all' || (filter === 'billable' ? e.billable : !e.billable))
  return (
    <section aria-label="Entries" className="card-table overflow-hidden">
      <PanelHeader icon={<ListChecks />} title="Entries" subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} this week`} actions={<ChipGroup size="sm" options={FILTERS} value={filter} onValueChange={setFilter} />} className="border-b border-line px-[23px] pb-4 pt-[17px]" />
      {shown.length === 0 ? (
        <EmptyState compact icon={<Timer />} title={entries.length ? 'No entries match this filter' : 'No time logged this week'} description={entries.length ? undefined : 'Start the timer or log time to see entries here.'} />
      ) : (
        <ul className="px-2.5 py-2">
          {shown.map((e) => (
            <li key={e.id} className="flex min-h-12 flex-wrap items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] transition-colors hover:bg-white/[0.04]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-control text-icon-muted" title={e.source === 'timer' ? 'Timer' : 'Manual'}>
                {e.source === 'timer' ? <Timer className="size-4" /> : <PenLine className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{e.label}</p>
                <p className="truncate text-[13px] text-[#959596]">{formatDate(e.date, { withWeekday: true })}{e.note ? ` · ${e.note}` : ''}</p>
              </div>
              <span className="w-20 text-right text-sm font-semibold tabular-nums text-white">{e.isRunning ? 'Running' : formatDuration(e.minutes)}</span>
              <BillableToggle entry={e} editable={editable && !e.isRunning} />
              {editable && !e.isRunning ? (
                <span className="flex items-center gap-1">
                  <EditEntry entry={e} />
                  <ConfirmDialog
                    trigger={<IconButton label="Delete entry" size="sm"><Trash2 className="size-4" /></IconButton>}
                    title="Delete this time entry?"
                    description={`${formatDuration(e.minutes)} on '${e.label}' will be removed.`}
                    confirmLabel="Delete"
                    onConfirm={() => deleteEntry({ id: e.id })}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
