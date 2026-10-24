'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { useRovingRadio } from '@/components/ui/use-roving-radio'

export const COLOR_PRESETS = ['#C084FC', '#BB62A5', '#60A5FA', '#5EEAB0', '#F5B85C', '#F0507A', '#E8804F', '#6366F1']

/** Spoken names for the swatches, so a screen reader says "Orchid", not "#BB62A5". */
export const COLOR_NAMES: Record<string, string> = {
  '#C084FC': 'Lavender',
  '#BB62A5': 'Orchid',
  '#60A5FA': 'Sky blue',
  '#5EEAB0': 'Mint',
  '#F5B85C': 'Amber',
  '#F0507A': 'Rose',
  '#E8804F': 'Orange',
  '#6366F1': 'Indigo',
}

/** Swatch row submitting `name` as a hex colour. One tab stop; arrow keys move between swatches. */
export function ColorPicker({ name = 'color', defaultValue = COLOR_PRESETS[0], label = 'Team colour' }: { name?: string; defaultValue?: string; label?: string }) {
  const [value, setValue] = useState(defaultValue)
  const pick = (c: string) => {
    play('toggle')
    setValue(c)
  }
  const radioProps = useRovingRadio(COLOR_PRESETS, value, pick)
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      <input type="hidden" name={name} value={value} />
      {COLOR_PRESETS.map((c, i) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_NAMES[c] ?? c}
          {...radioProps(i)}
          onClick={() => pick(c)}
          className={cn('press flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-[#1F1F1F] transition', value === c && 'ring-2 ring-white/70')}
          style={{ background: c }}
        >
          {value === c ? <Check className="size-4 text-black/70" /> : null}
        </button>
      ))}
    </div>
  )
}
