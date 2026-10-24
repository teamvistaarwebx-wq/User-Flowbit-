import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Empty state inside the card where the content would be (DESIGN 12): a plain 32px outline icon in muted grey,
 * one sentence saying what is missing, one line saying what to do, one button. No disc, no glow, no illustration.
 */
export function EmptyState({ icon, title, description, action, className, compact }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 py-8' : 'gap-2 py-14', className)}>
      {icon ? <div className="mb-2 text-icon-muted [&_svg]:size-8 [&_svg]:stroke-[1.25]">{icon}</div> : null}
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      {description ? <p className="max-w-sm text-[13px] text-fg-2">{description}</p> : null}
      {action ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}
