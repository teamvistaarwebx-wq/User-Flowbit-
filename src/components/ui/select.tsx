'use client'

import * as RS from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { fieldBase } from './input'

export type SelectOption = { value: string; label: string; hint?: string; disabled?: boolean }

export type SelectProps = {
  /** Form field name (a hidden native select is rendered for FormData). */
  name?: string
  options: SelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  size?: 'sm' | 'md'
  'aria-label'?: string
  id?: string
}

/** Radix select styled as a pill. Empty-string values are not allowed by Radix; use a placeholder instead. */
export function Select(props: SelectProps) {
  const { name, options, value, defaultValue, onValueChange, placeholder = 'Choose…', disabled, required, className, size = 'md', id, ...aria } = props
  // A caller that passes `value` (even undefined, before anything is picked) is controlled; '' shows the placeholder
  // instead of letting Radix flip from uncontrolled to controlled on the first pick.
  const controlled = 'value' in props
  return (
    <RS.Root
      name={name}
      value={controlled ? (value ?? '') : undefined}
      defaultValue={defaultValue}
      onValueChange={(v) => {
        play('toggle')
        onValueChange?.(v)
      }}
      onOpenChange={(open) => open && play('pop')}
      disabled={disabled}
      required={required}
    >
      <RS.Trigger
        id={id}
        aria-label={aria['aria-label']}
        className={cn(fieldBase, 'inline-flex items-center justify-between gap-2 rounded-full px-4 text-left', size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm', 'data-[placeholder]:text-fg-4', className)}
      >
        <span className="min-w-0 flex-1 truncate">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon className="shrink-0">
          <ChevronDown className="size-4 text-fg" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content position="popper" sideOffset={6} className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[10px] border border-white/[0.12] bg-menu p-1 shadow-pop animate-scale-in">
          <RS.Viewport className="p-0.5">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-9 cursor-pointer select-none items-center gap-2 rounded-[7px] pl-8 pr-3 text-sm text-fg outline-none data-[highlighted]:bg-white/[0.07] data-[disabled]:opacity-40"
              >
                <RS.ItemIndicator className="absolute left-2.5">
                  <Check className="size-3.5 text-fg" />
                </RS.ItemIndicator>
                <RS.ItemText>{o.label}</RS.ItemText>
                {o.hint ? <span className="ml-auto text-xs text-fg-3">{o.hint}</span> : null}
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  )
}
