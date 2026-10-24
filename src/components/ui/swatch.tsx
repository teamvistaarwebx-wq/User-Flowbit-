import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/status'
import { TONE_DOT } from './badge'

export type SwatchProps = {
  /** Status tone; or pass `color` for a series colour (CSS value). */
  tone?: Tone
  color?: string
  /** 'square' (radius 3, chart legends) or 'round' (status sets), as the Figma's legend keys. */
  shape?: 'square' | 'round'
  className?: string
}

/**
 * Legend key: a 12px key in the series colour, the Figma's Project overview (square) and
 * My attendance (round) legends. Use it in legends only, never inline before a label in running text.
 */
export function Swatch({ tone, color, shape = 'square', className }: SwatchProps) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 shrink-0', shape === 'round' ? 'rounded-full' : 'rounded-[3px]', tone && TONE_DOT[tone], className)}
      style={color ? { background: color } : undefined}
    />
  )
}
