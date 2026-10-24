'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type RadioCardOption = { value: string; title: ReactNode; description?: ReactNode; icon?: ReactNode; children?: ReactNode; disabled?: boolean }

export type RadioCardsProps = {
  name?: string
  options: RadioCardOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  columns?: 1 | 2 | 3
  className?: string
  /** Text of the tab on the chosen card (Figma: "Selected"). */
  selectedLabel?: string
}

/**
 * Large selectable cards (onboarding mode, plan picker), as the Figma option cards: radius 14, a 3px
 * white-to-orchid stroke and a "Selected" tab on the chosen one. Submits the value under `name`.
 */
export function RadioCards({ name, options, value, defaultValue, onValueChange, columns = 2, className, selectedLabel = 'Selected' }: RadioCardsProps) {
  const [inner, setInner] = useState(defaultValue ?? '')
  const current = value ?? inner
  const choose = (v: string) => {
    play('toggle')
    if (value === undefined) setInner(v)
    onValueChange?.(v)
  }
  return (
    <div role="radiogroup" className={cn('grid gap-5 pt-4', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3', className)}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      {options.map((o) => {
        const selected = o.value === current
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => choose(o.value)}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-[14px] p-[22px] text-left transition-[background-color,transform] duration-150 hover:-translate-y-px active:scale-[0.99] disabled:opacity-50',
              selected ? 'edge-selected bg-white/[0.1]' : 'border border-white/[0.14] bg-white/[0.05] hover:bg-white/[0.08]',
            )}
          >
            {selected ? (
              <span className="absolute -top-[17px] right-[18px] inline-flex h-[17px] items-center rounded-t-[8px] bg-violet-2 px-4 text-xs font-medium text-white">{selectedLabel}</span>
            ) : null}
            {o.icon ? <span className="text-pink [&_svg]:size-[26px] [&_svg]:stroke-[1.5]">{o.icon}</span> : null}
            <span className="text-lg font-semibold text-fg">{o.title}</span>
            {o.description ? <span className="text-sm text-fg">{o.description}</span> : null}
            {o.children}
          </button>
        )
      })}
    </div>
  )
}
