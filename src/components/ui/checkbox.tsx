'use client'

import * as RC from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type CheckboxProps = {
  name?: string
  /** Submitted value when checked (default 'on'). */
  value?: string
  checked?: boolean | 'indeterminate'
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  required?: boolean
  label?: ReactNode
  description?: ReactNode
  className?: string
  id?: string
  'aria-label'?: string
}

/** Checkbox (Figma: 21px, radius 5, 1.5px #AFAFAF stroke; checked fills violet) with an optional label. Plays `toggle`. */
export function Checkbox({ name, value = 'on', checked, defaultChecked, onCheckedChange, disabled, required, label, description, className, id, ...aria }: CheckboxProps) {
  const box = (
    <RC.Root
      id={id}
      name={name}
      value={value}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      required={required}
      aria-label={aria['aria-label']}
      onCheckedChange={(c) => {
        play('toggle', { on: c === true })
        onCheckedChange?.(c === true)
      }}
      className="peer flex size-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-[#AFAFAF] bg-transparent transition-colors hover:border-white data-[state=checked]:border-transparent data-[state=checked]:bg-chip-active data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-chip-active disabled:opacity-50"
    >
      <RC.Indicator>{checked === 'indeterminate' ? <Minus className="size-3 text-white" /> : <Check className="size-3 text-white" strokeWidth={3} />}</RC.Indicator>
    </RC.Root>
  )
  if (!label) return <span className={className}>{box}</span>
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-fg-2', disabled && 'cursor-not-allowed opacity-60', className)}>
      {box}
      <span>
        <span className="text-fg">{label}</span>
        {description ? <span className="block text-xs text-fg-3">{description}</span> : null}
      </span>
    </label>
  )
}
