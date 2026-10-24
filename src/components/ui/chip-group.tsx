'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { useRovingRadio } from './use-roving-radio'

export type Chip = { value: string; label: string; count?: number }

type Base = {
  name?: string
  options: Chip[]
  className?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  /** Names the group for screen readers (or use `aria-labelledby` with the visible label's id). */
  'aria-label'?: string
  'aria-labelledby'?: string
}
type Single = Base & { multiple?: false; value?: string; defaultValue?: string; onValueChange?: (value: string) => void }
type Multi = Base & { multiple: true; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void }
export type ChipGroupProps = Single | Multi

/**
 * Pill chips (Figma team-size chips): the active chip is solid #56397D. Single or multiple selection. Plays `toggle`.
 * Single selection is a radio group: one tab stop, arrow keys move and select.
 */
export function ChipGroup(props: ChipGroupProps) {
  const { name, options, className, size = 'md', disabled } = props
  const [inner, setInner] = useState<string[]>(() =>
    props.multiple ? (props.defaultValue ?? []) : props.defaultValue ? [props.defaultValue] : [],
  )
  const selected = props.multiple ? (props.value ?? inner) : props.value !== undefined ? [props.value] : inner

  const toggle = (v: string) => {
    play('toggle')
    if (props.multiple) {
      const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]
      if (props.value === undefined) setInner(next)
      props.onValueChange?.(next)
    } else {
      if (props.value === undefined) setInner([v])
      props.onValueChange?.(v)
    }
  }

  const values = options.map((o) => o.value)
  const radioProps = useRovingRadio(values, props.multiple ? undefined : selected[0], toggle)

  return (
    <div className={cn('flex flex-wrap gap-2', className)} role={props.multiple ? 'group' : 'radiogroup'} aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']}>
      {name ? selected.map((v) => <input key={v} type="hidden" name={props.multiple ? `${name}[]` : name} value={v} />) : null}
      {options.map((o, i) => {
        const active = selected.includes(o.value)
        return (
          <button
            key={o.value}
            {...(props.multiple ? {} : radioProps(i))}
            type="button"
            disabled={disabled}
            role={props.multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => toggle(o.value)}
            className={cn(
              'press inline-flex items-center justify-center gap-1.5 rounded-full border font-medium transition-colors duration-150 disabled:opacity-50',
              size === 'sm' ? 'h-7 px-3 text-[13px]' : 'h-9 px-4 text-sm',
              active ? 'border-transparent bg-chip-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'border-white/[0.15] bg-white/[0.08] text-fg hover:border-white/[0.28] hover:bg-white/[0.12]',
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/[0.16]' : 'text-fg-3')}>{o.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
