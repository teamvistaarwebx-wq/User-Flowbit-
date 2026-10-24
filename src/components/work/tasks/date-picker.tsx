'use client'

import { useState, type ReactNode } from 'react'
import { DATE_PRESETS } from '@/modules/work/tasks/constants'
import { isPlausibleDate, presetDate } from '@/modules/work/tasks/due'
import { formatDate } from '@/lib/dates'
import { play } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'

/** Date popover with IST quick picks (Today … 8 weeks), a date field and Clear. */
export function DatePicker({ value, onChange, today, trigger, label }: { value: string | null; onChange: (date: string | null) => void; today: string; trigger: ReactNode; label: string }) {
  const [open, setOpen] = useState(false)
  /** What is typed in the date field; saved only once the year is complete. */
  const [draft, setDraft] = useState(value ?? '')
  const toggle = (next: boolean) => {
    if (next) setDraft(value ?? '')
    setOpen(next)
  }
  const choose = (date: string | null) => {
    play('toggle')
    onChange(date)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={toggle} trigger={trigger} className="w-64">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {DATE_PRESETS.map((p) => {
          const date = presetDate(today, p.days)
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => choose(date)}
              className="press rounded-[10px] border border-white/[0.1] bg-control px-2.5 py-1.5 text-left text-xs text-fg-2 transition-colors hover:border-white/25 hover:text-white"
            >
              <span className="block text-[13px] font-medium text-white">{p.label}</span>
              <span className="text-[11px] tabular-nums text-[#979797]">{formatDate(date, { short: true })}</span>
            </button>
          )
        })}
      </div>
      <DateInput
        className="mt-3"
        inputSize="sm"
        value={draft}
        onChange={(e) => {
          // Typing a year fires change after its first digit (0002-…): wait until the date is real.
          setDraft(e.target.value)
          if (isPlausibleDate(e.target.value)) choose(e.target.value)
        }}
        aria-label={label}
      />
      {value ? (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => choose(null)}>
          Clear date
        </Button>
      ) : null}
    </Popover>
  )
}
