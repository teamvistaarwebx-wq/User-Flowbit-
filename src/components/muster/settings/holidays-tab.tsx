'use client'

import type { ReactNode } from 'react'
import { CalendarHeart, Plus, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { DateInput, Input } from '@/components/ui/input'
import { ActionButton } from '@/components/muster/people/action-button'
import { addHoliday, removeHoliday } from '@/modules/muster/settings/list-actions'
import { ListCard, ListRow, ListRows } from '../ui/list-card'

type Row = { id: string; date: string; name: string; isOptional: boolean }

/** Holidays for a year. Optional holidays are taken as paid leave, so the calendar ignores them. */
export function HolidaysTab({ rows, year, canWrite, yearSwitcher }: { rows: Row[]; year: number; canWrite: boolean; yearSwitcher: ReactNode }) {
  const company = rows.filter((r) => !r.isOptional).length
  return (
    <ListCard
      label={`Holidays ${year}`}
      icon={<CalendarHeart />}
      description={`${company} company holidays${rows.length > company ? ` and ${rows.length - company} optional` : ''}.`}
      actions={yearSwitcher}
      toolbar={
        canWrite ? (
          <ActionForm action={addHoliday} resetOnSuccess className="grid w-full gap-3 lit-edge rounded-[10px] bg-white/[0.035] p-4 sm:grid-cols-[170px_1fr_auto_auto] sm:items-end">
            <FormField name="date" label="Date" required><DateInput id="date" name="date" defaultValue={`${year}-01-01`} /></FormField>
            <FormField name="name" label="Name" required><Input id="name" name="name" placeholder="Diwali" /></FormField>
            <FormField name="isOptional"><Checkbox name="isOptional" label="Optional" /></FormField>
            <SubmitButton size="md" icon={<Plus className="size-4" />}>Add holiday</SubmitButton>
          </ActionForm>
        ) : null
      }
    >
      {rows.length ? (
        <ListRows>
          {rows.map((r) => (
            <ListRow key={r.id} className="flex-nowrap py-1.5">
              <span className="w-36 shrink-0 text-[13px] tabular-nums text-[#979797]">{formatDate(r.date, { withWeekday: true })}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-white">{r.name}</span>
              <Badge tone={r.isOptional ? 'neutral' : 'pink'}>{r.isOptional ? 'Optional' : 'Company'}</Badge>
              {canWrite ? <ActionButton action={removeHoliday} input={{ id: r.id }} label={<Trash2 className="size-4" />} title={`Remove ${r.name}?`} description={`${formatDate(r.date)} becomes a normal working day.`} confirmLabel="Remove" /> : null}
            </ListRow>
          ))}
        </ListRows>
      ) : (
        <EmptyState compact icon={<CalendarHeart />} title={`No holidays for ${year} yet`} description="Add the company's festival and national holidays." />
      )}
    </ListCard>
  )
}
