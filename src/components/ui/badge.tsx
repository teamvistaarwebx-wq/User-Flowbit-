import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { statusLabel, statusTone, type Tone } from '@/lib/status'

/**
 * Filled pill per tone, as the Figma's "In progress" and "−12%" pills: the colour is the fill and carries
 * the meaning. Light fills (amber, pink, orange) take dark ink so the label stays readable.
 */
export const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success text-white border-transparent',
  warning: 'bg-warning text-[#3B2C0B] border-transparent',
  danger: 'bg-[#E9403B] text-white border-transparent',
  info: 'bg-info text-white border-transparent',
  pink: 'bg-pink text-[#4A1D3F] border-transparent',
  orange: 'bg-orange text-[#3D1709] border-transparent',
  violet: 'bg-violet-2 text-white border-transparent',
  orchid: 'bg-[#8E4C80] text-white border-transparent',
  neutral: 'bg-[#313131] text-[#E6E5E6] border-transparent',
}

/** Solid fill per tone, for bars, segments and legend keys (not for dots before labels). */
export const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info', pink: 'bg-pink',
  orange: 'bg-orange', violet: 'bg-violet', orchid: 'bg-orchid', neutral: 'bg-[#5a585b]',
}

/** Text colour per tone, for coloured words on dark (priority labels, due dates, amounts). */
export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-[#2DCBAF]', warning: 'text-warning', danger: 'text-[#FF6A66]', info: 'text-[#8E8DFF]', pink: 'text-pink',
  orange: 'text-orange', violet: 'text-violet', orchid: 'text-link', neutral: 'text-fg-2',
}

export type BadgeProps = { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode; size?: 'sm' | 'md' }

/** Small filled pill with a tone. The tone carries the meaning: no status dot inside. */
export function Badge({ tone = 'neutral', children, className, icon, size = 'sm' }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium leading-none [&_svg]:size-3', size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-[13px]', TONE_CLASSES[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

/** Status pill using the shared status -> tone map ('overdue' is red everywhere). */
export function StatusPill({ status, label, tone, className, size }: { status: string | null | undefined; label?: string; tone?: Tone; className?: string; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={tone ?? statusTone(status)} className={className} size={size}>
      {label ?? statusLabel(status)}
    </Badge>
  )
}

/** Priority colours from the Figma table: High #FFA040, Medium #6160FF, Low #0CBA65. */
const PRIORITY: Record<string, { color: string; level: number }> = {
  low: { color: '#0CBA65', level: 1 },
  medium: { color: '#7473FF', level: 2 },
  high: { color: '#FFA040', level: 3 },
  urgent: { color: '#FF4540', level: 3 },
}

/** Priority as the three-bar signal icon + the word, both in the priority colour (Figma "Assign to me"). */
export function PriorityLabel({ priority }: { priority: 'low' | 'medium' | 'high' | 'urgent' | string }) {
  const p = PRIORITY[priority] ?? { color: 'var(--text-3)', level: 1 }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: p.color }}>
      <svg viewBox="0 0 12 14" className="h-3.5 w-3 shrink-0" aria-hidden>
        {[0, 1, 2].map((b) => (
          <rect key={b} x={b * 4.5} y={9 - b * 4} width="1.6" height={5 + b * 4} rx="0.8" fill="currentColor" opacity={b < p.level ? 1 : 0.28} />
        ))}
      </svg>
      {priority === 'urgent' ? 'Urgent' : statusLabel(priority)}
    </span>
  )
}
