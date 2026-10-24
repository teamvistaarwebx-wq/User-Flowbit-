import type { ReactNode } from 'react'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES = {
  info: { Icon: Info, ink: 'text-[#8E8DFF]' },
  warning: { Icon: TriangleAlert, ink: 'text-warning' },
  danger: { Icon: CircleAlert, ink: 'text-[#FF6A66]' },
  neutral: { Icon: Info, ink: 'text-icon-muted' },
} as const

export type NoteTone = keyof typeof TONES

/**
 * A quiet notice: a neutral translucent surface with the lit hairline, and only the outline icon carries the
 * tone. No tinted box and no coloured border (DESIGN 1: borders are translucent white, never a hue).
 */
export function Note({ tone = 'info', title, children, action, icon, className, compact }: { tone?: NoteTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string; compact?: boolean }) {
  const t = TONES[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('lit-edge flex flex-col gap-3 rounded-[10px] bg-white/[0.035] animate-fade-in sm:flex-row sm:items-center sm:justify-between', compact ? 'px-3 py-2.5' : 'px-4 py-3', className)}>
      <div className="flex min-w-0 gap-3">
        <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4', t.ink)}>{icon ?? <t.Icon strokeWidth={1.5} />}</span>
        <div className={cn('min-w-0', compact ? 'text-[13px]' : 'text-sm')}>
          {title ? <p className="font-medium text-fg">{title}</p> : null}
          {children ? <div className={cn('text-fg-2', title ? 'mt-0.5' : undefined)}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
