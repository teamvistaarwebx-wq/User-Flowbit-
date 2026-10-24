'use client'

import { Check, Plus } from 'lucide-react'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'

/** Colour picker from presets (plus any colour with `custom`); submits `name` as the hex value. */
export function ColorSwatches({ name, colors, value, onChange, custom }: { name: string; colors: readonly string[]; value: string; onChange: (color: string) => void; custom?: boolean }) {
  const isCustom = !colors.some((c) => c.toLowerCase() === value.toLowerCase())
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      <input type="hidden" name={name} value={value} />
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => {
            play('toggle')
            onChange(c)
          }}
          className={cn('flex size-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105', value === c ? 'border-white/80' : 'border-transparent')}
          style={{ background: c }}
        >
          {value === c ? <Check className="size-4 text-black/70" /> : null}
        </button>
      ))}
      {custom ? (
        <label
          title="Custom colour"
          className={cn('relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-transform hover:scale-105', isCustom ? 'border-white/80' : 'border-transparent')}
          style={{ background: isCustom ? value : 'conic-gradient(#f87171, #fbbf24, #4ade80, #60a5fa, #c084fc, #f87171)' }}
        >
          {isCustom ? <Check className="size-4 text-black/70" /> : <Plus className="size-4 text-white drop-shadow" />}
          <span className="sr-only">Custom colour</span>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#818cf8'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      ) : null}
    </div>
  )
}
