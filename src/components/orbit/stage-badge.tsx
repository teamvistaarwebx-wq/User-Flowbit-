import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { LEAD_STAGE_LABEL, type LeadStage } from '@/modules/orbit/constants'
import { LEAD_STAGE_FILL, LOST_FILL, WON_FILL, dealStageFill, type Fill } from './palette'

/**
 * A filled pill, as the Figma "In progress" pill: the colour is the fill and carries the meaning. No border, no
 * tinted wash, no dot. `color` (a stage config hex) is mapped onto the Figma palette.
 */
export function ColorChip({ color, fill, children, className, dim }: { color?: string; fill?: Fill; children: ReactNode; className?: string; dim?: boolean }) {
  const f = fill ?? dealStageFill(color)
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-none', dim && 'opacity-80', className)} style={{ background: f.bg, color: f.ink }}>
      {children}
    </span>
  )
}

export function LeadStageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  return (
    <ColorChip fill={LEAD_STAGE_FILL[stage]} className={className}>
      {LEAD_STAGE_LABEL[stage]}
    </ColorChip>
  )
}

export function DealStageBadge({ label, color, status }: { label: string; color: string; status: 'open' | 'won' | 'lost' }) {
  const fill = status === 'won' ? WON_FILL : status === 'lost' ? LOST_FILL : dealStageFill(color)
  return <ColorChip fill={fill}>{label}</ColorChip>
}
