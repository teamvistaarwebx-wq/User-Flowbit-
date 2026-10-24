'use client'

import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type SwitchProps = {
  name?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: ReactNode
  description?: ReactNode
  className?: string
  'aria-label'?: string
}

/** On/off switch (36 x 20, track #313131, on #56397D). In forms it submits 'true'/'false' under `name`. Plays `toggle`. */
export function Switch({ name, checked, defaultChecked = false, onCheckedChange, disabled, label, description, className, ...aria }: SwitchProps) {
  const [inner, setInner] = useState(defaultChecked)
  const labelId = useId()
  const on = checked ?? inner
  const toggle = () => {
    if (disabled) return
    play('toggle', { on: !on })
    if (checked === undefined) setInner(!on)
    onCheckedChange?.(!on)
  }
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={aria['aria-label']}
      aria-labelledby={label && !aria['aria-label'] ? labelId : undefined}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        on ? 'bg-chip-active' : 'bg-control-active',
      )}
    >
      <span className={cn('inline-block size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-200', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      {name ? <input type="hidden" name={name} value={on ? 'true' : 'false'} /> : null}
    </button>
  )
  if (!label) return <span className={className}>{control}</span>
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        <div id={labelId} className="text-sm text-fg">{label}</div>
        {description ? <div className="text-xs text-fg-3">{description}</div> : null}
      </div>
      {control}
    </div>
  )
}
